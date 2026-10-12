import React, { useState, useEffect } from 'react';
import { 
  Scan, ArrowRight, Trash2, Plus, RefreshCw, Crosshair, 
  ShieldCheck, AlertCircle, Sparkles, CheckCircle2, 
  HelpCircle, ChevronRight, Layers, FileText
} from 'lucide-react';
import { ManualAnnotation } from './ImageAnnotatorModal';
import { autoConvertToSimplified, FREQUENT_FAILURES } from '../utils/chineseConverter';

interface UploadedItem {
  id: string;
  file: File;
  previewUrl: string;
  aspectRatio: '4:5' | '16:9' | '9:16';
  manualAnnotations?: ManualAnnotation[];
  ocrStatus?: 'idle' | 'scanning' | 'done' | 'error';
  ocrDetectedRegions?: ManualAnnotation[];
  ocrTradCount?: number;
  ocrError?: string;
}

interface OcrProofreadingTableProps {
  items: UploadedItem[];
  activeCategory: '4:5' | '16:9' | '9:16';
  onUpdateAnnotation: (
    itemId: string, 
    annoId: string, 
    originalText: string, 
    targetText: string, 
    isTraditional?: boolean
  ) => void;
  onDeleteAnnotation: (itemId: string, annoId: string) => void;
  onAddAnnotation: (itemId: string, originalText?: string, targetText?: string) => void;
  onReScanOcr: (item: UploadedItem) => void;
  onOpenAnnotatorModal: (item: UploadedItem) => void;
  lang: 'sc' | 'tc';
}

export const OcrProofreadingTable: React.FC<OcrProofreadingTableProps> = ({
  items,
  activeCategory,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onAddAnnotation,
  onReScanOcr,
  onOpenAnnotatorModal,
  lang
}) => {
  const [selectedItemId, setSelectedItemId] = useState<string>(items[0]?.id || '');

  // Keep selectedItemId valid if items change
  const currentItem = items.find(it => it.id === selectedItemId) || items[0];
  const activeItemId = currentItem?.id;

  useEffect(() => {
    if (items.length > 0 && !items.some(it => it.id === selectedItemId)) {
      setSelectedItemId(items[0].id);
    }
  }, [items, selectedItemId]);

  if (items.length === 0) return null;

  const annotations = currentItem?.manualAnnotations || [];
  const isScanning = currentItem?.ocrStatus === 'scanning';
  const tradCount = annotations.filter(a => a.isTraditional !== false).length;

  const handleOriginalChange = (annoId: string, newOriginal: string, currentTarget: string) => {
    // If target is empty or matched previous auto-conversion, update target automatically
    const prevAuto = autoConvertToSimplified(newOriginal.slice(0, -1));
    const shouldAutoUpdate = !currentTarget || currentTarget === prevAuto || currentTarget === newOriginal;
    const nextTarget = shouldAutoUpdate ? autoConvertToSimplified(newOriginal) : currentTarget;
    onUpdateAnnotation(activeItemId, annoId, newOriginal, nextTarget);
  };

  const handleTargetChange = (annoId: string, currentOriginal: string, newTarget: string) => {
    onUpdateAnnotation(activeItemId, annoId, currentOriginal, newTarget);
  };

  const handleQuickPreset = (annoId: string, tc: string, sc: string) => {
    onUpdateAnnotation(activeItemId, annoId, tc, sc);
  };

  return (
    <div className="mt-4 border border-emerald-200/80 bg-gradient-to-b from-emerald-50/40 via-white to-white rounded-2xl p-4 shadow-xs">
      {/* Table Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-200">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="bg-emerald-600 text-white p-1.5 rounded-lg shadow-2xs">
              <FileText className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
              OCR 文字校對列表 (即時修改與強制引導)
            </h3>
            <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              已校對 {annotations.length} 處 ({tradCount} 處繁體)
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            可直接在下方表格修改 OCR 識別錯誤的原字或目標簡體；<b>修改後的文字將作為下一次生成任務的強制替換參數</b>。
          </p>
        </div>

        {/* Global actions for selected image */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onAddAnnotation(activeItemId)}
            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-2xs flex items-center gap-1 cursor-pointer"
            title="手動新增一筆文字對應關係"
          >
            <Plus className="w-3.5 h-3.5" />
            新增校對項目
          </button>

          <button
            onClick={() => onReScanOcr(currentItem)}
            disabled={isScanning}
            className="px-2.5 py-1.5 bg-white hover:bg-emerald-50 text-gray-700 hover:text-emerald-700 border border-gray-300 rounded-xl text-xs font-semibold transition-all flex items-center gap-1 disabled:opacity-50 cursor-pointer"
            title="重新使用 OCR 模型掃描當前圖片"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 ${isScanning ? 'animate-spin' : ''}`} />
            {isScanning ? '掃描中...' : '重新 OCR'}
          </button>

          <button
            onClick={() => onOpenAnnotatorModal(currentItem)}
            className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer"
            title="開啟互動式全圖框選工具，可直接在畫面上拖曳微調坐標"
          >
            <Crosshair className="w-3.5 h-3.5 text-blue-600" />
            框選工具
          </button>
        </div>
      </div>

      {/* Multi-image Selector Pills (if more than 1 image in current category) */}
      {items.length > 1 && (
        <div className="flex items-center gap-2 pt-3 pb-1 overflow-x-auto">
          <span className="text-xs font-semibold text-gray-500 shrink-0">選擇校對圖片:</span>
          {items.map((it, idx) => {
            const isSelected = it.id === activeItemId;
            const count = it.manualAnnotations?.length || 0;
            return (
              <button
                key={it.id}
                onClick={() => setSelectedItemId(it.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap border ${
                  isSelected
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border-gray-200'
                }`}
              >
                <span>#{idx + 1}</span>
                <span className="truncate max-w-[120px]">{it.file.name}</span>
                <span className={`text-[10px] px-1 rounded-full ${isSelected ? 'bg-emerald-700 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {count} 處
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Scanning status banner */}
      {isScanning && (
        <div className="my-3 p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-2.5 text-blue-800 text-xs animate-pulse">
          <RefreshCw className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
          <span><b>AI OCR 視覺模型正在高速掃描中...</b> 正精確提取圖片所有文字坐標，掃描完成後會即時列出文字對照。</span>
        </div>
      )}

      {/* Error status banner */}
      {currentItem?.ocrStatus === 'error' && (
        <div className="my-3 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between gap-3 text-red-800 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span><b>OCR 掃描發生問題：</b>{currentItem.ocrError || '連線或識別失敗'}</span>
          </div>
          <button
            onClick={() => onReScanOcr(currentItem)}
            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold shrink-0 cursor-pointer transition shadow-2xs"
          >
            點擊重新掃描
          </button>
        </div>
      )}

      {/* Proofreading Table */}
      <div className="mt-3 overflow-x-auto">
        {annotations.length === 0 ? (
          <div className="py-8 px-4 text-center border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50 space-y-2">
            <Scan className="w-8 h-8 text-gray-300 mx-auto" />
            <p className="text-xs font-semibold text-gray-600">目前未偵測到繁體字或尚未新增校對項目</p>
            <p className="text-[11px] text-gray-400">
              若圖片中有文字未被辨識，可點擊上方「新增校對項目」手動補齊，或點擊「重新 OCR」重新掃描。
            </p>
            <div className="pt-2">
              <button
                onClick={() => onAddAnnotation(activeItemId)}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-2xs inline-flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                新增第一筆校對項目
              </button>
            </div>
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-100/70 text-gray-600 text-[11px] font-semibold">
                <th className="py-2 px-3 rounded-l-lg w-12 text-center">#</th>
                <th className="py-2 px-3 w-28">來源 / 標籤</th>
                <th className="py-2 px-3 min-w-[150px]">偵測到的繁體原文 (可直接修改)</th>
                <th className="py-2 px-2 w-8 text-center">➔</th>
                <th className="py-2 px-3 min-w-[160px]">簡體轉換目標 (強制引導替換)</th>
                <th className="py-2 px-3 w-36">位置坐標 [y1,x1,y2,x2]</th>
                <th className="py-2 px-3 rounded-r-lg w-16 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {annotations.map((anno, idx) => {
                const isAuto = anno.source === 'auto_ocr';
                const isTrad = anno.isTraditional !== false;

                return (
                  <tr 
                    key={anno.id} 
                    className="hover:bg-emerald-50/40 transition-colors group"
                  >
                    {/* Index */}
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-gray-500">
                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] text-white ${
                        isTrad ? 'bg-emerald-600' : 'bg-blue-600'
                      }`}>
                        {idx + 1}
                      </span>
                    </td>

                    {/* Source / Label */}
                    <td className="py-2.5 px-3">
                      <div className="flex flex-col gap-0.5">
                        <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded w-fit ${
                          isAuto
                            ? isTrad
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-blue-100 text-blue-800 border border-blue-200'
                            : 'bg-red-100 text-red-800 border border-red-200'
                        }`}>
                          {isAuto ? (isTrad ? 'OCR 繁體' : 'OCR 文字') : '手動補齊'}
                        </span>
                        {anno.label && (
                          <span className="text-[10px] text-gray-400 truncate max-w-[90px]">
                            {anno.label}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Original Text Input */}
                    <td className="py-2.5 px-3">
                      <div className="relative">
                        <input
                          type="text"
                          value={anno.originalText}
                          onChange={(e) => handleOriginalChange(anno.id, e.target.value, anno.targetText)}
                          placeholder="輸入圖片繁體原文..."
                          className="w-full px-2.5 py-1.5 bg-white border border-gray-300 hover:border-gray-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-lg text-xs font-semibold text-gray-800 transition"
                        />
                      </div>
                    </td>

                    {/* Arrow */}
                    <td className="py-2.5 px-2 text-center text-gray-400">
                      <ArrowRight className="w-3.5 h-3.5 mx-auto text-emerald-600" />
                    </td>

                    {/* Target Simplified Text Input */}
                    <td className="py-2.5 px-3">
                      <div className="space-y-1">
                        <input
                          type="text"
                          value={anno.targetText}
                          onChange={(e) => handleTargetChange(anno.id, anno.originalText, e.target.value)}
                          placeholder="強制轉換簡體目標..."
                          className="w-full px-2.5 py-1.5 bg-white border border-emerald-300 hover:border-emerald-400 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 rounded-lg text-xs font-bold text-emerald-900 transition shadow-2xs"
                        />
                        {/* Quick preset suggestion if original text matches frequent stubborn character */}
                        {anno.originalText && FREQUENT_FAILURES.some(f => anno.originalText.includes(f.tc) && !anno.targetText.includes(f.sc)) && (
                          <div className="flex items-center gap-1 text-[10px]">
                            {FREQUENT_FAILURES.filter(f => anno.originalText.includes(f.tc)).map(f => (
                              <button
                                key={f.tc}
                                type="button"
                                onClick={() => handleQuickPreset(anno.id, anno.originalText, anno.targetText ? anno.targetText.replace(f.tc, f.sc) : f.sc)}
                                className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-1.5 py-0.2 rounded font-medium cursor-pointer"
                              >
                                快速帶入: {f.tc}➔{f.sc}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Coordinates */}
                    <td className="py-2.5 px-3 text-[11px] font-mono text-gray-500">
                      <div className="bg-gray-50 border border-gray-200 rounded px-1.5 py-1 inline-block text-[10px]">
                        [{anno.box2d.join(', ')}]
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="py-2.5 px-3 text-center">
                      <button
                        onClick={() => onDeleteAnnotation(activeItemId, anno.id)}
                        className="text-gray-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition cursor-pointer"
                        title="刪除此校對項目"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer helper & stubborn character chips */}
      <div className="mt-3 pt-3 border-t border-gray-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-gray-500 text-[11px] flex-wrap">
          <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="font-semibold text-gray-700">常見易失真字元速查：</span>
          {FREQUENT_FAILURES.slice(0, 6).map(f => (
            <span 
              key={f.tc} 
              className="bg-white border border-gray-200 px-1.5 py-0.5 rounded text-[10px] font-mono text-gray-600"
            >
              {f.tc}➔{f.sc}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2 text-[11px] text-emerald-800 font-semibold bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>修改已即時同步至生成任務引導參數</span>
        </div>
      </div>
    </div>
  );
};
