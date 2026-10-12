import React, { useState, useRef, useEffect, MouseEvent } from 'react';
import { 
  X, Target, Trash2, Check, Sparkles, HelpCircle, 
  ZoomIn, ArrowRight, CornerDownRight, Crosshair, AlertTriangle,
  Scan, RefreshCw, Loader2, CheckCircle2, Eye, ShieldCheck, Plus
} from 'lucide-react';
import { autoConvertToSimplified, FREQUENT_FAILURES } from '../utils/chineseConverter';

export interface ManualAnnotation {
  id: string;
  box2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0-1000 scale
  boxPct: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  originalText: string;
  targetText: string;
  isTraditional?: boolean;
  confidence?: string;
  label?: string;
  source?: 'auto_ocr' | 'manual';
}

interface ImageAnnotatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  fileName: string;
  initialAnnotations: ManualAnnotation[];
  onSave: (annotations: ManualAnnotation[]) => void;
  lang: 'sc' | 'tc';
  onTriggerOcr?: (model: string) => Promise<ManualAnnotation[] | void>;
  isOcrScanning?: boolean;
  assistantModel?: string;
  onAssistantModelChange?: (model: string) => void;
}

export const ImageAnnotatorModal: React.FC<ImageAnnotatorModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  fileName,
  initialAnnotations,
  onSave,
  lang,
  onTriggerOcr,
  isOcrScanning = false,
  assistantModel = 'gemini-3.8-flash',
  onAssistantModelChange
}) => {
  const [annotations, setAnnotations] = useState<ManualAnnotation[]>(initialAnnotations || []);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'traditional' | 'manual'>('all');
  const [selectedOcrModel, setSelectedOcrModel] = useState<string>(assistantModel);

  // Drag-to-box states
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [startPct, setStartPct] = useState<{ x: number; y: number } | null>(null);
  const [currentPct, setCurrentPct] = useState<{ x: number; y: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (isOpen) {
      setAnnotations(initialAnnotations || []);
      if (initialAnnotations && initialAnnotations.length > 0) {
        setActiveId(initialAnnotations[0].id);
      } else {
        setActiveId(null);
      }
    }
  }, [isOpen, initialAnnotations]);

  if (!isOpen) return null;

  // Convert mouse event coordinates to percentages (0 - 100) relative to image
  const getCoordinatesFromEvent = (e: MouseEvent<HTMLDivElement>) => {
    if (!imageRef.current) return null;
    const rect = imageRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    return { x, y };
  };

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // Only left mouse button
    const coords = getCoordinatesFromEvent(e);
    if (!coords) return;
    setIsDrawing(true);
    setStartPct(coords);
    setCurrentPct(coords);
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !startPct) return;
    const coords = getCoordinatesFromEvent(e);
    if (!coords) return;
    setCurrentPct(coords);
  };

  const handleMouseUp = () => {
    if (!isDrawing || !startPct || !currentPct) {
      setIsDrawing(false);
      setStartPct(null);
      setCurrentPct(null);
      return;
    }

    const xmin = Math.min(startPct.x, currentPct.x);
    const xmax = Math.max(startPct.x, currentPct.x);
    const ymin = Math.min(startPct.y, currentPct.y);
    const ymax = Math.max(startPct.y, currentPct.y);

    const width = xmax - xmin;
    const height = ymax - ymin;

    // Minimum 1% threshold to avoid accidental micro-clicks
    if (width >= 1 && height >= 1) {
      const box2d: [number, number, number, number] = [
        Math.round((ymin / 100) * 1000),
        Math.round((xmin / 100) * 1000),
        Math.round((ymax / 100) * 1000),
        Math.round((xmax / 100) * 1000),
      ];

      const newId = `manual_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const newAnno: ManualAnnotation = {
        id: newId,
        box2d,
        boxPct: {
          top: ymin,
          left: xmin,
          width,
          height,
        },
        originalText: '',
        targetText: '',
        isTraditional: true,
        source: 'manual',
        label: '手動補齊'
      };

      setAnnotations(prev => [...prev, newAnno]);
      setActiveId(newId);
    }

    setIsDrawing(false);
    setStartPct(null);
    setCurrentPct(null);
  };

  const handleUpdateText = (id: string, originalText: string, targetText?: string) => {
    setAnnotations(prev =>
      prev.map(a => {
        if (a.id !== id) return a;
        const autoTarget = targetText !== undefined ? targetText : autoConvertToSimplified(originalText);
        return {
          ...a,
          originalText,
          targetText: autoTarget,
        };
      })
    );
  };

  const handleDeleteAnnotation = (id: string) => {
    setAnnotations(prev => prev.filter(a => a.id !== id));
    if (activeId === id) {
      setActiveId(null);
    }
  };

  const handleClearAll = () => {
    setAnnotations([]);
    setActiveId(null);
  };

  const handleApplyPreset = (id: string, tc: string, sc: string) => {
    setAnnotations(prev =>
      prev.map(a => {
        if (a.id !== id) return a;
        return {
          ...a,
          originalText: tc,
          targetText: sc,
        };
      })
    );
  };

  const handleSaveAndClose = () => {
    onSave(annotations);
    onClose();
  };

  const handleTriggerOcrClick = async () => {
    if (!onTriggerOcr) return;
    try {
      const newRegions = await onTriggerOcr(selectedOcrModel);
      if (Array.isArray(newRegions) && newRegions.length > 0) {
        // Merge with existing manual annotations to preserve user additions
        const manualOnly = annotations.filter(a => a.source === 'manual');
        const combined = [...newRegions, ...manualOnly];
        setAnnotations(combined);
        setActiveId(combined[0]?.id || null);
      }
    } catch (e) {
      console.error('Trigger OCR error', e);
    }
  };

  // Preview box while user is dragging
  const getDrawingBoxStyle = () => {
    if (!startPct || !currentPct) return null;
    const left = Math.min(startPct.x, currentPct.x);
    const top = Math.min(startPct.y, currentPct.y);
    const width = Math.abs(currentPct.x - startPct.x);
    const height = Math.abs(currentPct.y - startPct.y);
    return {
      left: `${left}%`,
      top: `${top}%`,
      width: `${width}%`,
      height: `${height}%`,
    };
  };

  const activeAnnotation = annotations.find(a => a.id === activeId);

  const autoCount = annotations.filter(a => a.source === 'auto_ocr').length;
  const manualCount = annotations.filter(a => a.source === 'manual').length;
  const tradCount = annotations.filter(a => a.isTraditional !== false).length;

  const filteredAnnotations = annotations.filter(a => {
    if (filterType === 'traditional') return a.isTraditional !== false;
    if (filterType === 'manual') return a.source === 'manual';
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-2 sm:p-4 md:p-6 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl h-[94vh] flex flex-col overflow-hidden border border-gray-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-gray-200 bg-gray-50 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-600 text-white p-2 rounded-xl shadow-xs">
              <Scan className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-gray-900 text-base">
                  繁體中文檢測與標註中心
                </h3>
                <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  已識別繁體字 {tradCount} 處
                </span>
                {autoCount > 0 && (
                  <span className="text-[11px] bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded-full">
                    OCR 自動識別: {autoCount}
                  </span>
                )}
                {manualCount > 0 && (
                  <span className="text-[11px] bg-red-100 text-red-700 font-semibold px-2 py-0.5 rounded-full">
                    手動補齊: {manualCount}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                檔案：<span className="font-mono text-gray-700 font-medium">{fileName}</span> · 綠框為 OCR 自動識別，紅框為手動框選；可在圖片上拖曳補充漏掉的文字
              </p>
            </div>
          </div>

          {/* Top Actions & OCR trigger */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {onTriggerOcr && (
              <div className="flex items-center gap-1.5 bg-white border border-gray-300 rounded-xl p-1 shadow-2xs">
                <select
                  value={selectedOcrModel}
                  onChange={e => {
                    setSelectedOcrModel(e.target.value);
                    if (onAssistantModelChange) onAssistantModelChange(e.target.value);
                  }}
                  disabled={isOcrScanning}
                  className="text-xs font-semibold text-gray-700 bg-transparent px-2 py-1 outline-none border-r border-gray-200"
                >
                  <option value="gemini-3.8-flash">Gemini 3.8 Flash (最新款/高精度)</option>
                  <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash-Lite (高速極省)</option>
                </select>

                <button
                  onClick={handleTriggerOcrClick}
                  disabled={isOcrScanning}
                  className="px-2.5 py-1 text-xs font-bold text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                  title="調用 Gemini OCR 模型重新掃描圖片中的所有文字"
                >
                  {isOcrScanning ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                      <span>OCR 掃描中...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 text-emerald-600" />
                      <span>重新 OCR 掃描</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {annotations.length > 0 && (
              <button
                onClick={handleClearAll}
                className="text-xs text-gray-500 hover:text-red-600 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:border-red-200 hover:bg-red-50 transition-colors flex items-center gap-1 font-medium cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                清空
              </button>
            )}

            <button
              onClick={handleSaveAndClose}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Check className="w-4 h-4" />
              套用所有標註 ({annotations.length})
            </button>

            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Body */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden bg-gray-100">
          
          {/* Left Canvas Viewport */}
          <div 
            ref={containerRef}
            className="flex-1 relative p-4 flex items-center justify-center overflow-auto select-none bg-neutral-900/95"
          >
            {/* Image Stage Container */}
            <div 
              className="relative max-w-full max-h-full inline-block cursor-crosshair shadow-2xl rounded-lg overflow-hidden border border-neutral-700/80"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <img
                ref={imageRef}
                src={imageUrl}
                alt="Source preview for annotation"
                className="max-h-[76vh] w-auto object-contain block pointer-events-none"
                draggable={false}
              />

              {/* Render Existing Bounding Boxes */}
              {annotations.map((anno, index) => {
                const isActive = anno.id === activeId;
                const isAuto = anno.source === 'auto_ocr';
                const isTrad = anno.isTraditional !== false;

                const borderColor = isAuto
                  ? isTrad 
                    ? isActive ? 'border-emerald-400 bg-emerald-500/30 ring-2 ring-emerald-300' : 'border-emerald-500/90 bg-emerald-500/20 hover:bg-emerald-500/30'
                    : isActive ? 'border-blue-400 bg-blue-500/30 ring-2 ring-blue-300' : 'border-blue-500/80 bg-blue-500/15 hover:bg-blue-500/25'
                  : isActive ? 'border-red-500 bg-red-500/30 ring-2 ring-red-400' : 'border-red-500/90 bg-red-500/20 hover:bg-red-500/30';

                const badgeBg = isAuto
                  ? isTrad ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white'
                  : 'bg-red-600 text-white';

                return (
                  <div
                    key={anno.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveId(anno.id);
                    }}
                    style={{
                      top: `${anno.boxPct.top}%`,
                      left: `${anno.boxPct.left}%`,
                      width: `${anno.boxPct.width}%`,
                      height: `${anno.boxPct.height}%`,
                    }}
                    className={`absolute border-2 transition-all cursor-pointer pointer-events-auto group ${borderColor} ${
                      isActive ? 'shadow-lg z-30' : 'z-20'
                    }`}
                  >
                    {/* Corner Handles */}
                    <span className={`absolute -top-1 -left-1 w-2.5 h-2.5 border border-white rounded-xs ${isAuto ? 'bg-emerald-500' : 'bg-red-600'}`} />
                    <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 border border-white rounded-xs ${isAuto ? 'bg-emerald-500' : 'bg-red-600'}`} />
                    <span className={`absolute -bottom-1 -left-1 w-2.5 h-2.5 border border-white rounded-xs ${isAuto ? 'bg-emerald-500' : 'bg-red-600'}`} />
                    <span className={`absolute -bottom-1 -right-1 w-2.5 h-2.5 border border-white rounded-xs ${isAuto ? 'bg-emerald-500' : 'bg-red-600'}`} />

                    {/* Tag Badge */}
                    <div className={`absolute -top-6 left-0 z-30 flex items-center gap-1 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap ${badgeBg}`}>
                      <span>#{index + 1}</span>
                      {isAuto && (
                        <span className="text-[9px] opacity-85 font-sans">
                          {isTrad ? '[OCR繁]' : '[OCR]'}
                        </span>
                      )}
                      {!isAuto && (
                        <span className="text-[9px] opacity-85 font-sans">[手動]</span>
                      )}
                      {anno.originalText ? (
                        <span>
                          {anno.originalText} ➔ {anno.targetText || '?'}
                        </span>
                      ) : (
                        <span>點擊輸入文字</span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAnnotation(anno.id);
                        }}
                        className="ml-1 hover:text-red-200 text-white/80 p-0.5"
                        title="刪除此標註"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Dynamic Dragging Box */}
              {isDrawing && getDrawingBoxStyle() && (
                <div
                  style={getDrawingBoxStyle()!}
                  className="absolute border-2 border-dashed border-red-400 bg-red-500/20 pointer-events-none animate-pulse z-40"
                >
                  <div className="absolute -top-5 left-0 bg-red-600 text-white text-[9px] font-bold px-1 rounded shadow-xs">
                    框選補齊中...
                  </div>
                </div>
              )}
            </div>

            {/* Bottom floating helper tooltip */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-md text-white/95 text-xs px-4 py-2 rounded-full border border-white/20 shadow-md flex items-center gap-2 pointer-events-none">
              <Crosshair className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                綠框為 AI OCR 自動檢測出的繁體字。<b>若有漏掉的文字，直接在圖片上按住滑鼠拖曳框選即可補齊！</b>
              </span>
            </div>
          </div>

          {/* Right Inspector & Settings Panel */}
          <div className="w-full lg:w-96 bg-white border-t lg:border-t-0 lg:border-l border-gray-200 flex flex-col justify-between shrink-0 overflow-y-auto">
            <div className="p-5 space-y-4">
              
              {/* Instructions banner */}
              <div className="bg-emerald-50/80 border border-emerald-200 p-3 rounded-xl text-emerald-900 text-xs space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  OCR 繁體字檢測驗證指南：
                </div>
                <p className="text-[11px] leading-relaxed text-emerald-700">
                  系統已為您自動識別並高亮圖片中所有繁體中文區域（座標已傳遞至重繪模型）。請核對是否有遺漏的文字（如小標題或姓氏）；若有遺漏，請直接在左圖拖曳新增。
                </p>
              </div>

              {/* Active Item Editor */}
              {activeAnnotation ? (
                <div className="bg-gray-50 border border-gray-300 rounded-xl p-4 space-y-3.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                      <Target className="w-4 h-4 text-emerald-600" />
                      選中標註 #{annotations.findIndex(a => a.id === activeAnnotation.id) + 1}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        activeAnnotation.source === 'auto_ocr' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {activeAnnotation.source === 'auto_ocr' ? 'AI OCR 識別' : '使用者手動框選'}
                      </span>
                    </span>
                    <button
                      onClick={() => handleDeleteAnnotation(activeAnnotation.id)}
                      className="text-xs text-red-600 hover:text-red-800 flex items-center gap-1 font-medium cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> 刪除
                    </button>
                  </div>

                  {/* Normalized Coordinates */}
                  <div className="text-[11px] font-mono bg-white border border-gray-200 rounded-lg p-2 text-gray-600 flex justify-between">
                    <span className="text-gray-400">正規化座標 [y1,x1,y2,x2]:</span>
                    <span className="font-bold text-gray-800">
                      [{activeAnnotation.box2d.join(', ')}]
                    </span>
                  </div>

                  {/* Character input form */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-700 block">
                      1. 圖片中的繁體原文 (Original):
                    </label>
                    <input
                      type="text"
                      value={activeAnnotation.originalText}
                      onChange={(e) => handleUpdateText(activeAnnotation.id, e.target.value)}
                      placeholder="例如：譚、體育、讓..."
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                      autoFocus
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-semibold text-gray-700 block">
                        2. 強制替換的簡體目標 (Target):
                      </label>
                      <span className="text-[10px] text-gray-400">已自動繁轉簡</span>
                    </div>
                    <input
                      type="text"
                      value={activeAnnotation.targetText}
                      onChange={(e) => handleUpdateText(activeAnnotation.id, activeAnnotation.originalText, e.target.value)}
                      placeholder="例如：谭、体育、让..."
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
                    />
                  </div>

                  {/* Quick Preset Buttons for Common Stubborn Characters */}
                  <div className="space-y-1.5 pt-1">
                    <div className="text-[11px] font-medium text-gray-500 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-amber-500" />
                      常見難以轉換字元（點擊快速帶入）：
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {FREQUENT_FAILURES.map(item => (
                        <button
                          key={item.tc}
                          type="button"
                          onClick={() => handleApplyPreset(activeAnnotation.id, item.tc, item.sc)}
                          className="text-[10px] bg-white hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 border border-gray-200 px-2 py-1 rounded-md text-gray-700 font-medium transition cursor-pointer"
                        >
                          {item.tc}➔{item.sc}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-5 text-center text-gray-400 space-y-2">
                  <Crosshair className="w-7 h-7 mx-auto text-gray-300" />
                  <p className="text-xs font-medium text-gray-600">目前未選中任何標註</p>
                  <p className="text-[11px] text-gray-400 leading-normal">
                    在左側圖片上按住滑鼠拖曳框選以補齊遺漏的字，或點選下方清單進行校對。
                  </p>
                </div>
              )}

              {/* Filter Tabs */}
              <div className="flex items-center gap-1 border-b border-gray-200 pb-2">
                <button
                  onClick={() => setFilterType('all')}
                  className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                    filterType === 'all' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  全部 ({annotations.length})
                </button>
                <button
                  onClick={() => setFilterType('traditional')}
                  className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                    filterType === 'traditional' ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  繁體字 ({tradCount})
                </button>
                <button
                  onClick={() => setFilterType('manual')}
                  className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                    filterType === 'manual' ? 'bg-red-600 text-white' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  手動補齊 ({manualCount})
                </button>
              </div>

              {/* All Annotations List */}
              <div className="space-y-2">
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                  {filteredAnnotations.length === 0 ? (
                    <div className="text-xs text-gray-400 text-center py-4 border border-gray-100 rounded-lg">
                      此分類下無標註項目
                    </div>
                  ) : (
                    filteredAnnotations.map((anno, idx) => {
                      const isSelected = anno.id === activeId;
                      const isAuto = anno.source === 'auto_ocr';
                      return (
                        <div
                          key={anno.id}
                          onClick={() => setActiveId(anno.id)}
                          className={`p-2.5 rounded-xl border text-xs flex items-center justify-between cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-emerald-50/80 border-emerald-300 shadow-2xs'
                              : 'bg-white border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`w-5 h-5 rounded-full text-white font-bold text-[10px] flex items-center justify-center shrink-0 ${
                              isAuto ? 'bg-emerald-600' : 'bg-red-600'
                            }`}>
                              {idx + 1}
                            </span>
                            <div className="truncate">
                              <div className="font-semibold text-gray-800 flex items-center gap-1">
                                {anno.originalText ? (
                                  <span className="truncate">
                                    「{anno.originalText}」 ➔ 「{anno.targetText || '?'}」
                                  </span>
                                ) : (
                                  <span className="text-amber-600 font-normal">待輸入文字...</span>
                                )}
                              </div>
                              <div className="text-[10px] text-gray-400 font-mono truncate">
                                座標: [{anno.box2d.join(', ')}] · {isAuto ? 'AI OCR' : '手動'}
                              </div>
                            </div>
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteAnnotation(anno.id);
                            }}
                            className="text-gray-400 hover:text-red-600 p-1 rounded transition shrink-0"
                            title="刪除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

            </div>

            {/* Bottom Actions */}
            <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between gap-3 shrink-0">
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-xl transition cursor-pointer"
              >
                取消
              </button>

              <button
                onClick={handleSaveAndClose}
                className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Check className="w-4 h-4" />
                保存標註並套用 ({annotations.length})
              </button>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
};

export default ImageAnnotatorModal;
