import React, { useState, useRef, useEffect, MouseEvent } from 'react';
import { 
  X, Palette, Undo, Trash2, Wand2, Loader2, Sparkles, 
  CheckCircle2, AlertCircle, Sliders, Layers, Eye, RefreshCw, 
  Download, ChevronRight, HelpCircle, CornerDownRight, Maximize2
} from 'lucide-react';

export interface ColorBrushConfig {
  id: string;
  name: string;
  hex: string;
  label: string;
  placeholder: string;
}

export const BRUSH_COLORS: ColorBrushConfig[] = [
  { id: 'red', name: '紅色', hex: '#EF4444', label: '🔴 紅色筆觸', placeholder: '例：將紅圈處標題字體改為粗體，文字修正為「特惠熱賣」' },
  { id: 'green', name: '綠色', hex: '#10B981', label: '🟢 綠色筆觸', placeholder: '例：抹除綠圈處的小圖示，平滑修補周圍背景' },
  { id: 'blue', name: '藍色', hex: '#3B82F6', label: '🔵 藍色筆觸', placeholder: '例：將藍圈處區域顏色調整為清爽海軍藍' },
  { id: 'yellow', name: '黃色', hex: '#F59E0B', label: '🟡 黃色筆觸', placeholder: '例：將黃圈處人名「譚」確認替換為簡體規範字「谭」' },
  { id: 'purple', name: '紫色', hex: '#8B5CF6', label: '🟣 紫色筆觸', placeholder: '例：在紫圈處加強微光粒子特效，提升視覺焦點' },
];

export interface Point {
  x: number;
  y: number;
}

export interface CanvasStroke {
  id: string;
  colorHex: string;
  colorId: string;
  width: number;
  points: Point[];
}

interface ImageDeepEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  sourceRatio: string;
  targetRatio: string;
  onApplyEdit: (params: {
    cleanImageBase64: string;
    annotatedImageBase64: string;
    colorInstructions: Record<string, string>;
    globalInstruction: string;
    modelName: string;
  }) => Promise<string | void>;
  isProcessing: boolean;
}

export const ImageDeepEditModal: React.FC<ImageDeepEditModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  sourceRatio,
  targetRatio,
  onApplyEdit,
  isProcessing
}) => {
  // Brush configuration states
  const [activeColorId, setActiveColorId] = useState<string>('red');
  const [brushWidth, setBrushWidth] = useState<number>(4); // Default 4px (2px - 8px)
  const [strokes, setStrokes] = useState<CanvasStroke[]>([]);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  
  // Instructions states
  const [colorInstructions, setColorInstructions] = useState<Record<string, string>>({
    red: '',
    green: '',
    blue: '',
    yellow: '',
    purple: ''
  });
  const [globalInstruction, setGlobalInstruction] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('gemini-nano-banana-2.1');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Canvas refs
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageObjRef = useRef<HTMLImageElement | null>(null);
  const currentStrokePoints = useRef<Point[]>([]);

  const activeBrush = BRUSH_COLORS.find(c => c.id === activeColorId) || BRUSH_COLORS[0];

  // Count strokes per color
  const colorStrokeCounts = BRUSH_COLORS.reduce<Record<string, number>>((acc, c) => {
    acc[c.id] = strokes.filter(s => s.colorId === c.id).length;
    return acc;
  }, {});

  // Load image onto canvas on open
  useEffect(() => {
    if (!isOpen || !imageUrl) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageObjRef.current = img;
      redrawCanvas();
    };
    img.src = imageUrl;
  }, [isOpen, imageUrl]);

  // Redraw when strokes change
  useEffect(() => {
    if (imageObjRef.current) {
      redrawCanvas();
    }
  }, [strokes]);

  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    const img = imageObjRef.current;
    if (!canvas || !img) return;

    // Set canvas dimensions to image natural size for high precision
    if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background image
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Draw all strokes
    strokes.forEach(stroke => {
      if (stroke.points.length === 0) return;
      ctx.beginPath();
      ctx.strokeStyle = stroke.colorHex;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    });
  };

  const getCanvasCoords = (e: MouseEvent<HTMLCanvasElement>): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handleMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 || isProcessing) return;
    const pt = getCanvasCoords(e);
    if (!pt) return;

    setIsDrawing(true);
    currentStrokePoints.current = [pt];

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.strokeStyle = activeBrush.hex;
      ctx.lineWidth = brushWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(pt.x, pt.y);
    }
  };

  const handleMouseMove = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || isProcessing) return;
    const pt = getCanvasCoords(e);
    if (!pt) return;

    currentStrokePoints.current.push(pt);

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx) {
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (currentStrokePoints.current.length > 0) {
      const newStroke: CanvasStroke = {
        id: `stroke_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        colorHex: activeBrush.hex,
        colorId: activeBrush.id,
        width: brushWidth,
        points: [...currentStrokePoints.current],
      };
      setStrokes(prev => [...prev, newStroke]);
    }
    currentStrokePoints.current = [];
  };

  const handleUndo = () => {
    if (strokes.length === 0 || isProcessing) return;
    setStrokes(prev => prev.slice(0, -1));
  };

  const handleClearCurrentColor = () => {
    if (isProcessing) return;
    setStrokes(prev => prev.filter(s => s.colorId !== activeColorId));
  };

  const handleClearAll = () => {
    if (isProcessing) return;
    setStrokes([]);
  };

  const handleInstructionChange = (colorId: string, val: string) => {
    setColorInstructions(prev => ({
      ...prev,
      [colorId]: val,
    }));
  };

  const handleSubmit = async () => {
    setErrorMessage('');
    
    // Check if at least one instruction is provided
    const hasColorInstructions = Object.values(colorInstructions).some((t: any) => typeof t === 'string' && t.trim().length > 0);
    const hasGlobalInstruction = globalInstruction.trim().length > 0;

    if (!hasColorInstructions && !hasGlobalInstruction && strokes.length === 0) {
      setErrorMessage('請在畫面上圈選筆觸或輸入至少一項編輯指令');
      return;
    }

    try {
      // 1. Get clean image Base64
      let cleanImageBase64 = imageUrl;
      if (cleanImageBase64.startsWith('data:')) {
        cleanImageBase64 = cleanImageBase64.split(',')[1];
      }

      // 2. Export annotated image with drawn brush strokes
      const canvas = canvasRef.current;
      if (!canvas) throw new Error('畫布無法讀取');
      const annotatedDataUrl = canvas.toDataURL('image/jpeg', 0.95);
      const annotatedImageBase64 = annotatedDataUrl.split(',')[1];

      await onApplyEdit({
        cleanImageBase64,
        annotatedImageBase64,
        colorInstructions,
        globalInstruction,
        modelName: selectedModel,
      });

      onClose();
    } catch (err: any) {
      console.error('Deep edit submission failed:', err);
      setErrorMessage(err.message || '深度編輯任務失敗，請稍後再試');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-2 sm:p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl h-[94vh] flex flex-col overflow-hidden border border-gray-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-purple-600 text-white p-2 rounded-xl shadow-xs">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-gray-900 text-base">
                  轉換結果深度編輯中心
                </h3>
                <span className="text-xs bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded-full border border-purple-200 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                  筆觸圈選局部修復 + 全局指令引導
                </span>
                <span className="text-xs bg-gray-100 text-gray-600 font-mono px-2 py-0.5 rounded">
                  比例: {sourceRatio || targetRatio || '原圖比例'}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                使用 5 色筆觸在畫面上圈選任何瑕疵位置並附加修改指令，AI 重繪時將自動抹除筆劃並精確渲染指定內容。
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Model Selector */}
            <div className="flex items-center gap-1.5 bg-white border border-gray-300 rounded-xl px-2 py-1 shadow-2xs text-xs">
              <span className="text-gray-400 font-medium">重繪模型:</span>
              <select
                value={selectedModel}
                onChange={e => setSelectedModel(e.target.value)}
                disabled={isProcessing}
                className="bg-transparent font-semibold text-gray-700 outline-none cursor-pointer"
              >
                <option value="gemini-nano-banana-2.1">Nano Banana 2 (首選 1K 高清)</option>
                <option value="gemini-3-pro-image">Nano Banana Pro (專業重繪)</option>
              </select>
            </div>

            <button
              onClick={onClose}
              disabled={isProcessing}
              className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden bg-gray-100">
          
          {/* Left Canvas Drawing Area */}
          <div 
            ref={containerRef}
            className="flex-1 relative p-4 flex flex-col items-center justify-center overflow-auto select-none bg-neutral-900/95"
          >
            {/* Top Canvas Toolbar */}
            <div className="absolute top-4 z-20 bg-neutral-800/90 backdrop-blur-md border border-neutral-700 rounded-2xl p-2 shadow-xl flex items-center gap-3 flex-wrap">
              
              {/* 5 Brush Colors */}
              <div className="flex items-center gap-1.5 bg-neutral-900/60 p-1 rounded-xl border border-neutral-700">
                <span className="text-[11px] font-medium text-neutral-400 px-1">顏色:</span>
                {BRUSH_COLORS.map(brush => {
                  const isSelected = brush.id === activeColorId;
                  const count = colorStrokeCounts[brush.id] || 0;
                  return (
                    <button
                      key={brush.id}
                      onClick={() => setActiveColorId(brush.id)}
                      className={`relative px-2 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                        isSelected 
                          ? 'ring-2 ring-white/90 shadow-md scale-105' 
                          : 'opacity-70 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: brush.hex, color: '#FFFFFF' }}
                      title={`${brush.name}筆觸 (已圈選 ${count} 筆)`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full bg-white/90 shrink-0" />
                      <span>{brush.name}</span>
                      {count > 0 && (
                        <span className="text-[10px] bg-black/60 px-1 py-0.2 rounded-full font-mono text-white">
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Brush Width Slider (2px - 8px, default 4px) */}
              <div className="flex items-center gap-2 bg-neutral-900/60 px-2.5 py-1 rounded-xl border border-neutral-700">
                <span className="text-[11px] font-medium text-neutral-400">粗細:</span>
                <input
                  type="range"
                  min="2"
                  max="8"
                  step="1"
                  value={brushWidth}
                  onChange={e => setBrushWidth(Number(e.target.value))}
                  className="w-20 accent-purple-500 cursor-pointer"
                  title={`筆觸粗細：${brushWidth}px (預設 4px)`}
                />
                <span className="text-xs font-mono font-bold text-white min-w-[28px] text-center">
                  {brushWidth}px
                </span>
                {/* Visual dot preview of brush width */}
                <span 
                  className="rounded-full shrink-0 transition-all"
                  style={{
                    width: `${brushWidth * 2}px`,
                    height: `${brushWidth * 2}px`,
                    backgroundColor: activeBrush.hex
                  }}
                />
              </div>

              {/* Quick width presets */}
              <div className="hidden sm:flex items-center gap-1">
                {[2, 4, 6, 8].map(sz => (
                  <button
                    key={sz}
                    onClick={() => setBrushWidth(sz)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition cursor-pointer ${
                      brushWidth === sz 
                        ? 'bg-purple-600 text-white' 
                        : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
                    }`}
                  >
                    {sz}px{sz === 4 ? '★' : ''}
                  </button>
                ))}
              </div>

              {/* Canvas action buttons */}
              <div className="flex items-center gap-1.5 border-l border-neutral-700 pl-2">
                <button
                  onClick={handleUndo}
                  disabled={strokes.length === 0 || isProcessing}
                  className="p-1.5 bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40 text-neutral-200 rounded-lg text-xs flex items-center gap-1 transition cursor-pointer"
                  title="復原上一筆筆觸"
                >
                  <Undo className="w-3.5 h-3.5" />
                  <span className="text-[11px] hidden sm:inline">復原</span>
                </button>

                <button
                  onClick={handleClearCurrentColor}
                  disabled={colorStrokeCounts[activeColorId] === 0 || isProcessing}
                  className="px-2 py-1.5 bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40 text-neutral-200 rounded-lg text-xs flex items-center gap-1 transition cursor-pointer"
                  title={`清除當前${activeBrush.name}筆觸`}
                >
                  <span className="text-[11px]">清{activeBrush.name}</span>
                </button>

                <button
                  onClick={handleClearAll}
                  disabled={strokes.length === 0 || isProcessing}
                  className="p-1.5 bg-neutral-700 hover:bg-red-900/60 hover:text-red-200 disabled:opacity-40 text-neutral-300 rounded-lg text-xs transition cursor-pointer"
                  title="清空所有筆觸"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

            </div>

            {/* Interactive Drawing Canvas Stage */}
            <div className="relative max-w-full max-h-full inline-block shadow-2xl rounded-lg overflow-hidden border border-neutral-700/80 my-auto">
              <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                className="max-h-[72vh] w-auto object-contain block cursor-crosshair"
              />
            </div>

            {/* Bottom helper tip */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-md text-white/90 text-xs px-4 py-1.5 rounded-full border border-white/20 shadow-md flex items-center gap-2 pointer-events-none">
              <Sliders className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <span>
                在畫面上<b>按住滑鼠拖曳圈選</b>瑕疵處，右側輸入該顏色圈選區域的修改需求。
              </span>
            </div>
          </div>

          {/* Right Inspector & Instructions Panel */}
          <div className="w-full lg:w-[420px] bg-white border-t lg:border-t-0 lg:border-l border-gray-200 flex flex-col justify-between shrink-0 overflow-y-auto">
            <div className="p-5 space-y-4">
              
              {/* Feature Intro */}
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-purple-900 text-xs space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-purple-800">
                  <Wand2 className="w-4 h-4 text-purple-600 shrink-0" />
                  精準局部圈選編輯機制：
                </div>
                <p className="text-[11px] leading-relaxed text-purple-700">
                  選擇顏色並在圖上圈選特定文字或物體，並於下方對應欄位輸入該標記區域的具體指示。AI 會以標記作為引導並<b>在輸出成品中自動消除所有彩色筆痕</b>。
                </p>
              </div>

              {/* 5 Color Instructions Form */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                    <Palette className="w-4 h-4 text-purple-600" />
                    各顏色圈選區域專屬編輯指令：
                  </label>
                  <span className="text-[10px] text-gray-400">
                    共圈選 {strokes.length} 處筆觸
                  </span>
                </div>

                <div className="space-y-2.5">
                  {BRUSH_COLORS.map(brush => {
                    const count = colorStrokeCounts[brush.id] || 0;
                    const isActive = brush.id === activeColorId;
                    const text = colorInstructions[brush.id] || '';

                    return (
                      <div 
                        key={brush.id}
                        className={`p-2.5 rounded-xl border transition-all ${
                          isActive 
                            ? 'bg-gray-50 border-gray-300 ring-1 ring-purple-400/40' 
                            : 'bg-white border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => setActiveColorId(brush.id)}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <span 
                              className="w-3 h-3 rounded-full shrink-0" 
                              style={{ backgroundColor: brush.hex }}
                            />
                            <span className="text-xs font-bold text-gray-800">
                              {brush.name}圈選區域
                            </span>
                            {count > 0 ? (
                              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded-full">
                                已圈選 {count} 筆
                              </span>
                            ) : (
                              <span className="text-[10px] text-gray-400">
                                尚未圈選
                              </span>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveColorId(brush.id);
                            }}
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded cursor-pointer ${
                              isActive ? 'bg-purple-600 text-white' : 'text-gray-500 hover:bg-gray-100'
                            }`}
                          >
                            {isActive ? '繪畫中' : '切換為此筆觸'}
                          </button>
                        </div>

                        <input
                          type="text"
                          value={text}
                          onChange={(e) => handleInstructionChange(brush.id, e.target.value)}
                          placeholder={brush.placeholder}
                          className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Global Instruction Section */}
              <div className="space-y-1.5 pt-2 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-purple-600" />
                    全局編輯指令 (Global Directive)：
                  </label>
                  <span className="text-[10px] text-purple-600 font-medium">整張圖片通用</span>
                </div>
                <textarea
                  rows={3}
                  value={globalInstruction}
                  onChange={(e) => setGlobalInstruction(e.target.value)}
                  placeholder="例：微調整張圖片的飽和度與光影，文字保持極致清晰，未標記的背景和人像保持 100% 相同，輸出 1K 高畫質..."
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-medium text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500"
                />

                {/* Quick preset chips for global instruction */}
                <div className="flex flex-wrap gap-1 pt-1">
                  {[
                    '保持背景質地不變',
                    '文字加強對比度',
                    '保持商標與Logo完整',
                    '消除反光邊緣',
                    '提升1K高清細節'
                  ].map(chip => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setGlobalInstruction(prev => prev ? `${prev}，${chip}` : chip)}
                      className="text-[10px] bg-gray-100 hover:bg-purple-50 hover:text-purple-700 hover:border-purple-200 border border-gray-200 px-2 py-0.5 rounded-md text-gray-600 transition cursor-pointer"
                    >
                      +{chip}
                    </button>
                  ))}
                </div>
              </div>

              {errorMessage && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

            </div>

            {/* Bottom Action Footer */}
            <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={onClose}
                disabled={isProcessing}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-xl transition cursor-pointer"
              >
                取消
              </button>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={isProcessing}
                className="flex-1 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs flex items-center justify-center gap-2 transition cursor-pointer"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>AI 深度重繪進行中...</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4" />
                    <span>送出深度編輯任務</span>
                  </>
                )}
              </button>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
};

export default ImageDeepEditModal;
