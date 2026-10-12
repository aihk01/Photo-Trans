import { useState, useRef, useEffect, DragEvent } from 'react';
import { 
  Upload, Image as ImageIcon, Download, Loader2, ArrowRight, AlertCircle, 
  RefreshCcw, Globe, DollarSign, History, X, Trash2, CheckSquare, Square, 
  Check, Layers, Sparkles, Calendar, TrendingUp, Crosshair, Target,
  Scan, ShieldCheck, RefreshCw, Eye, CheckCircle2, Palette, Wand2 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getAllSavedResults, saveSingleResult, deleteSingleResult, clearAllSavedResults, StoredResultItem } from './db';
import { ImageAnnotatorModal, ManualAnnotation } from './components/ImageAnnotatorModal';
import { OcrProofreadingTable } from './components/OcrProofreadingTable';
import { ImageDeepEditModal } from './components/ImageDeepEditModal';
import { autoConvertToSimplified, hasTraditionalCharacters } from './utils/chineseConverter';

interface HistoryRecord {
  id: string;
  timestamp: number;
  date: string;
  dayKey: string;
  monthKey: string;
  modelName: string;
  assistantModel?: string;
  inputImages: number;
  inputTokens: number;
  outputImages: number;
  outputTokens: number;
  cost: number;
}

interface UploadedFileItem {
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

interface ResultItem {
  id: string;
  sourceRatio: '4:5' | '16:9' | '9:16';
  sourceIndex: number;
  targetRatio: string;
  originalPreviewUrl: string;
  resultUrl: string | null;
  status: 'pending' | 'processing' | 'success' | 'error';
  errorMessage?: string;
  createdAt?: number;
}

const PRICING = {
  'gemini-nano-banana-2.1': {
    name: 'Nano Banana 2.1',
    inputImageCost: 0.00468, // HKD (1120 tokens)
    inputImageTokens: 1120,
    inputTextPer1M: 0.585, // HKD
    outputImageCost: 0.7878, // HKD (1680 tokens)
    outputImageTokens: 1680
  },
  'gemini-3.1-flash-image': {
    name: 'Nano Banana 2',
    inputImageCost: 0.00468, // HKD (1120 tokens)
    inputImageTokens: 1120,
    inputTextPer1M: 0.585, // HKD
    outputImageCost: 0.7878, // HKD (1680 tokens)
    outputImageTokens: 1680
  },
  'gemini-3-pro-image': {
    name: 'Nano Banana Pro',
    inputImageCost: 0.00858, // HKD (560 tokens)
    inputImageTokens: 560,
    inputTextPer1M: 9.75, // HKD
    outputImageCost: 1.0452, // HKD (1120 tokens)
    outputImageTokens: 1120
  }
};

const ASSISTANT_PRICING = {
  'gemini-3.8-flash': {
    name: 'Gemini 3.8 Flash',
    inputTextPer1M: 0.585, // HKD (~$0.075 USD)
    outputTextPer1M: 2.34, // HKD (~$0.30 USD)
  },
  'gemini-3.1-flash-lite': {
    name: 'Gemini 3.1 Flash-Lite',
    inputTextPer1M: 0.2925, // HKD (~$0.0375 USD)
    outputTextPer1M: 1.17, // HKD (~$0.15 USD)
  }
};

const translations = {
  sc: {
    cancelBtn: '取消生成',
    cancelMsg: '已取消处理其余图片',
    title: '繁简图片批量翻译器 Pro',
    desc: '支持同时上传 3 种尺寸 (4:5, 16:9, 9:16) 每种最多 3 张原图，一键同尺寸批量转换繁体中文标题图片为简体中文图片。',
    uploadTitle: '点击或拖曳图片至此处',
    uploadDesc: '支持 PNG, JPG, WebP 格式 (最多3张)',
    originalImg: '原图 (繁体)',
    translatedImg: '转换结果 (简体)',
    processing1: 'AI 正在识别与重新绘制文字...',
    processing2: '生成中，请耐心等待...',
    waiting: '等待处理...',
    reupload: '清空图片',
    start: '开始批量转换',
    downloadAll: '下载全部结果',
    downloadSingle: '下载 (2K)',
    apiKeyRequired: '需要设置 API Key',
    apiKeyDesc: '此应用程序使用 Gemini 图像渲染模型，需绑定您的 API Key。',
    selectKey: '选择 API Key',
    errorNoImg: '模型未返回图片内容，请重试。',
    errorAIFail: 'AI 未能生成图片。\n',
    errorReason: '原因: ',
    errorRetry: '请稍后重试。',
    errorUnknown: '处理图片时发生未知错误',
    errorInvalidFile: '请上传有效的图片文件 (PNG, JPG 等)',
    errorHighDemand: '目前服务器请求量过大，请稍后重试，或尝试切换至其他模型。',
    error500: '服务器内部错误 (500)，请稍后重试或尝试切换至其他模型。',
    retryBtn: '重新尝试',
    regenerateBtn: '重新生成全部',
    clickToEnlarge: '点击放大',
    instructionPlaceholder: '附加文字指令 (选填，例如：将背景改为透明、转换为像素风)...',
    generateBtn: '开始生成',
    targetRatiosLabel: '目标输出比例 (可多选同时生成):',
    sourceCategory: '源图片分类',
    totalUploaded: '已上传',
    maxPerCategory: '每种尺寸最多 3 张',
    batchProgress: '批量转换进度',
    deleteAllResults: '全部删除',
    confirmDeleteAll: '确定要删除全部已保存的生成结果吗？',
    deleteSingle: '删除此图片',
    savedCount: '已保存',
    assistantLabel: '双阶段文字增强 (OCR & 护标)',
    assistantModelLabel: '辅助模型:',
    tokenCounter: 'Token 计算器',
    todayCost: '今日消耗',
    monthCost: '当月消耗',
    lastBatchCost: '单次任务消耗',
    monthlyRecord: '月度消耗汇总',
    clearHistoryBtn: '清空历史纪录',
    confirmClearHistory: '确定要清空全部 Token 历史纪录吗？'
  },
  tc: {
    cancelBtn: '取消生成',
    cancelMsg: '已取消處理其餘圖片',
    title: '繁簡圖片批量翻譯器 Pro',
    desc: '支援同時上傳 3 種尺寸 (4:5, 16:9, 9:16) 每種最多 3 張原圖，一鍵同尺寸批量轉換繁體中文標題圖片為簡體中文圖片。',
    uploadTitle: '點擊或拖曳圖片至此處',
    uploadDesc: '支援 PNG, JPG, WebP 格式 (最多3張)',
    originalImg: '原圖 (繁體)',
    translatedImg: '轉換結果 (簡體)',
    processing1: 'AI 正在識別與重新繪製文字...',
    processing2: '生成中，請耐心等候...',
    waiting: '等待處理...',
    reupload: '清空圖片',
    start: '開始批量轉換',
    downloadAll: '下載全部結果',
    downloadSingle: '下載 (2K)',
    apiKeyRequired: '需要設定 API Key',
    apiKeyDesc: '此應用程式使用 Gemini 圖像渲染模型，需綁定您的 API Key。',
    selectKey: '選擇 API Key',
    errorNoImg: '模型未返回圖片內容，請重試。',
    errorAIFail: 'AI 未能生成圖片。\n',
    errorReason: '原因: ',
    errorRetry: '請稍後重試。',
    errorUnknown: '處理圖片時發生未知錯誤',
    errorInvalidFile: '請上傳有效的圖片檔案 (PNG, JPG 等)',
    errorHighDemand: '目前伺服器請求量過大，請稍後重試，或嘗試切換至其他模型。',
    error500: '伺服器內部錯誤 (500)，請稍後重試或嘗試切換至其他模型。',
    retryBtn: '重新嘗試',
    regenerateBtn: '重新生成全部',
    clickToEnlarge: '點擊放大',
    instructionPlaceholder: '附加文字指令 (選填，例如：將背景改為透明、轉換為像素風)...',
    generateBtn: '開始生成',
    targetRatiosLabel: '目標輸出比例 (可多選同時生成):',
    sourceCategory: '源圖片分類',
    totalUploaded: '已上傳',
    maxPerCategory: '每種尺寸最多 3 張',
    batchProgress: '批量轉換進度',
    deleteAllResults: '全部刪除',
    confirmDeleteAll: '確定要刪除全部已儲存的生成結果嗎？',
    deleteSingle: '刪除此圖片',
    savedCount: '已儲存',
    assistantLabel: '雙階段文字增強 (OCR & 護標)',
    assistantModelLabel: '輔助模型:',
    tokenCounter: 'Token 計算器',
    todayCost: '今日消耗',
    monthCost: '當月消耗',
    lastBatchCost: '單次任務消耗',
    monthlyRecord: '月度消耗彙總',
    clearHistoryBtn: '清空歷史紀錄',
    confirmClearHistory: '確定要清空全部 Token 歷史紀錄嗎？'
  }
};

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

export default function App() {
  // Upload states for 3 categories: 4:5, 16:9, 9:16
  const [uploads, setUploads] = useState<Record<'4:5' | '16:9' | '9:16', UploadedFileItem[]>>({
    '4:5': [],
    '16:9': [],
    '9:16': []
  });

  const [activeTab, setActiveTab] = useState<'4:5' | '16:9' | '9:16'>('4:5');

  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [results, setResults] = useState<ResultItem[]>([]);
  const [currentProcessingIndex, setCurrentProcessingIndex] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [instruction, setInstruction] = useState<string>('');
  
  const [lang, setLang] = useState<'sc' | 'tc'>('sc'); // SC by default
  const [modelName, setModelName] = useState<string>('gemini-nano-banana-2.1');
  const t = translations[lang];

  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);
  const [annotatingItem, setAnnotatingItem] = useState<{
    categoryRatio: '4:5' | '16:9' | '9:16';
    item: UploadedFileItem;
  } | null>(null);
  const [deepEditingItem, setDeepEditingItem] = useState<ResultItem | null>(null);
  const [isDeepEditing, setIsDeepEditing] = useState<boolean>(false);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState<boolean>(false);
  
  const [enableAssistant, setEnableAssistant] = useState<boolean>(true);
  const [assistantModel, setAssistantModel] = useState<string>('gemini-3.8-flash');
  const [autoOcrOnUpload, setAutoOcrOnUpload] = useState<boolean>(true);

  const [history, setHistory] = useState<HistoryRecord[]>(() => {
    try {
      const saved = localStorage.getItem('transchar_token_history');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to load token history from localStorage', e);
    }
    return [];
  });
  const [showHistory, setShowHistory] = useState(false);

  // Sync token history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('transchar_token_history', JSON.stringify(history));
    } catch (e) {
      console.warn('Failed to save token history to localStorage', e);
    }
  }, [history]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isCancelledRef = useRef<boolean>(false);

  // Load persistent results from IndexedDB on initial mount
  useEffect(() => {
    async function loadSaved() {
      try {
        const saved = await getAllSavedResults();
        if (saved && saved.length > 0) {
          setResults(saved.map(item => ({
            ...item,
            sourceIndex: item.sourceIndex || 1,
            originalPreviewUrl: item.originalPreviewUrl || ''
          })));
        }
      } catch (err) {
        console.error('Failed to load saved results from IndexedDB:', err);
      }
    }
    loadSaved();
  }, []);

  const totalUploadedCount = uploads['4:5'].length + uploads['16:9'].length + uploads['9:16'].length;

  // Single item OCR scanning function
  const runOcrScanForItem = async (
    item: UploadedFileItem, 
    categoryRatio: '4:5' | '16:9' | '9:16',
    modelOverride?: string
  ): Promise<ManualAnnotation[]> => {
    const modelToUse = modelOverride || assistantModel;

    // Mark as scanning and clear previous errors
    setUploads(prev => ({
      ...prev,
      [categoryRatio]: prev[categoryRatio].map(it =>
        it.id === item.id ? { ...it, ocrStatus: 'scanning', ocrError: undefined } : it
      )
    }));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    try {
      // Safe, ultra-fast FileReader conversion (prevents main thread freezing on large images)
      const base64Content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const res = (reader.result as string) || '';
          const commaIdx = res.indexOf(',');
          resolve(commaIdx !== -1 ? res.slice(commaIdx + 1) : res);
        };
        reader.onerror = () => reject(new Error('圖片讀取失敗'));
        reader.readAsDataURL(item.file);
      });

      const response = await fetch('/api/scan-ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          base64Content,
          mimeType: item.file.type || 'image/jpeg',
          modelName: modelToUse
        })
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `OCR 請求失敗 (${response.status})`);
      }

      const data = await response.json();
      const detectedRegions: ManualAnnotation[] = Array.isArray(data.regions) ? data.regions : [];
      const tradRegions = detectedRegions.filter(r => r.isTraditional !== false);

      setUploads(prev => ({
        ...prev,
        [categoryRatio]: prev[categoryRatio].map(it => {
          if (it.id !== item.id) return it;
          
          // Merge with any custom user-added annotations
          const existingManual = (it.manualAnnotations || []).filter(a => a.source === 'manual');
          const mergedAnnotations = [...detectedRegions, ...existingManual];

          return {
            ...it,
            ocrStatus: 'done',
            ocrDetectedRegions: detectedRegions,
            ocrTradCount: tradRegions.length,
            manualAnnotations: mergedAnnotations,
            ocrError: undefined
          };
        })
      }));

      // Accumulate token usage in Token Calculator
      if (data.tokens && data.tokens.totalTokens > 0) {
        const asstKey = (data.tokens.model in ASSISTANT_PRICING) 
          ? (data.tokens.model as keyof typeof ASSISTANT_PRICING) 
          : 'gemini-3.8-flash';
        const asstPrice = ASSISTANT_PRICING[asstKey];
        const inCost = (data.tokens.promptTokens / 1000000) * asstPrice.inputTextPer1M;
        const outCost = (data.tokens.candidateTokens / 1000000) * asstPrice.outputTextPer1M;
        const ocrCost = inCost + outCost;

        const nowObj = new Date();
        const pad = (n: number) => n.toString().padStart(2, '0');
        const dayKey = `${nowObj.getFullYear()}-${pad(nowObj.getMonth() + 1)}-${pad(nowObj.getDate())}`;
        const monthKey = `${nowObj.getFullYear()}-${pad(nowObj.getMonth() + 1)}`;

        const newRecord: HistoryRecord = {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: Date.now(),
          date: nowObj.toLocaleString(),
          dayKey,
          monthKey,
          modelName: `OCR 掃描 (${asstPrice.name})`,
          assistantModel: asstPrice.name,
          inputImages: 1,
          inputTokens: data.tokens.promptTokens,
          outputImages: 0,
          outputTokens: data.tokens.candidateTokens,
          cost: ocrCost
        };
        setHistory(prev => [newRecord, ...prev]);
      }

      return detectedRegions;
    } catch (err: any) {
      console.error('OCR scan failed:', err);
      setUploads(prev => ({
        ...prev,
        [categoryRatio]: prev[categoryRatio].map(it =>
          it.id === item.id ? { 
            ...it, 
            ocrStatus: 'error', 
            ocrError: err.message || 'OCR 識別失敗' 
          } : it
        )
      }));
      return [];
    }
  };

  const handleFilesUpload = (files: FileList | File[], categoryRatio: '4:5' | '16:9' | '9:16') => {
    const validFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
      if (files[i].type.startsWith('image/')) {
        validFiles.push(files[i]);
      }
    }

    if (validFiles.length === 0) {
      setErrorMessage(t.errorInvalidFile);
      return;
    }

    const newCreatedItems: UploadedFileItem[] = [];

    setUploads(prev => {
      const currentList = prev[categoryRatio];
      const availableSpace = 3 - currentList.length;
      if (availableSpace <= 0) return prev;

      const filesToAdd: UploadedFileItem[] = validFiles.slice(0, availableSpace).map(f => {
        const itemObj: UploadedFileItem = {
          id: Math.random().toString(36).substring(2, 9),
          file: f,
          previewUrl: URL.createObjectURL(f),
          aspectRatio: categoryRatio,
          ocrStatus: autoOcrOnUpload ? 'scanning' : 'idle',
        };
        newCreatedItems.push(itemObj);
        return itemObj;
      });

      return {
        ...prev,
        [categoryRatio]: [...currentList, ...filesToAdd]
      };
    });

    // Auto-trigger OCR model for all newly added images
    if (autoOcrOnUpload && newCreatedItems.length > 0) {
      newCreatedItems.forEach(item => {
        runOcrScanForItem(item, categoryRatio);
      });
    }

    setErrorMessage('');
  };

  const removeImage = (categoryRatio: '4:5' | '16:9' | '9:16', id: string) => {
    setUploads(prev => ({
      ...prev,
      [categoryRatio]: prev[categoryRatio].filter(item => item.id !== id)
    }));
  };

  const handleSaveAnnotations = (categoryRatio: '4:5' | '16:9' | '9:16', itemId: string, annotations: ManualAnnotation[]) => {
    setUploads(prev => ({
      ...prev,
      [categoryRatio]: prev[categoryRatio].map(item =>
        item.id === itemId ? { 
          ...item, 
          manualAnnotations: annotations,
          ocrTradCount: annotations.filter(a => a.isTraditional !== false).length
        } : item
      )
    }));
  };

  // Proofreading table handlers: directly modify OCR detection results to force-guide next generation
  const handleProofreadUpdate = (
    itemId: string, 
    annoId: string, 
    originalText: string, 
    targetText: string,
    isTraditional?: boolean
  ) => {
    setUploads(prev => {
      const currentList = prev[activeTab];
      return {
        ...prev,
        [activeTab]: currentList.map(item => {
          if (item.id !== itemId) return item;
          const updated = (item.manualAnnotations || []).map(a => {
            if (a.id !== annoId) return a;
            return {
              ...a,
              originalText,
              targetText,
              isTraditional: isTraditional !== undefined ? isTraditional : (hasTraditionalCharacters(originalText) || a.isTraditional)
            };
          });
          return {
            ...item,
            manualAnnotations: updated,
            ocrTradCount: updated.filter(a => a.isTraditional !== false).length
          };
        })
      };
    });
  };

  const handleProofreadDelete = (itemId: string, annoId: string) => {
    setUploads(prev => {
      const currentList = prev[activeTab];
      return {
        ...prev,
        [activeTab]: currentList.map(item => {
          if (item.id !== itemId) return item;
          const updated = (item.manualAnnotations || []).filter(a => a.id !== annoId);
          return {
            ...item,
            manualAnnotations: updated,
            ocrTradCount: updated.filter(a => a.isTraditional !== false).length
          };
        })
      };
    });
  };

  const handleProofreadAdd = (itemId: string, originalText = '', targetText = '') => {
    setUploads(prev => {
      const currentList = prev[activeTab];
      return {
        ...prev,
        [activeTab]: currentList.map(item => {
          if (item.id !== itemId) return item;
          const newId = `manual_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const autoTarget = targetText || autoConvertToSimplified(originalText);
          const newAnno: ManualAnnotation = {
            id: newId,
            box2d: [100, 100, 300, 500],
            boxPct: { top: 10, left: 10, width: 40, height: 20 },
            originalText,
            targetText: autoTarget,
            isTraditional: true,
            source: 'manual',
            label: '手動校對補齊'
          };
          const updated = [...(item.manualAnnotations || []), newAnno];
          return {
            ...item,
            manualAnnotations: updated,
            ocrTradCount: updated.filter(a => a.isTraditional !== false).length
          };
        })
      };
    });
  };

  const clearAllUploads = () => {
    isCancelledRef.current = true;
    setUploads({
      '4:5': [],
      '16:9': [],
      '9:16': []
    });
    // Generated results are preserved until explicitly deleted by user
    setStatus('idle');
    setErrorMessage('');
  };

  const handleDeleteSingleResult = async (id: string) => {
    setResults(prev => prev.filter(item => item.id !== id));
    try {
      await deleteSingleResult(id);
    } catch (err) {
      console.error('Failed to delete item from IndexedDB:', err);
    }
  };

  const handleDeleteAllResults = () => {
    if (results.length === 0) return;
    setShowDeleteAllConfirm(true);
  };

  const confirmDeleteAllResults = async () => {
    setShowDeleteAllConfirm(false);
    setResults([]);
    try {
      await clearAllSavedResults();
    } catch (err) {
      console.error('Failed to clear results from IndexedDB:', err);
    }
  };

  const cancelBatchProcess = () => {
    isCancelledRef.current = true;
    setResults(prev => prev.map(res => res.status === 'pending' ? {
      ...res,
      status: 'error',
      errorMessage: lang === 'sc' ? '已取消生成' : '已取消生成'
    } : res));
  };

  // Main processing pipeline
  const startBatchProcess = async () => {
    const allItems: UploadedFileItem[] = [
      ...uploads['4:5'],
      ...uploads['16:9'],
      ...uploads['9:16']
    ];

    if (allItems.length === 0) return;

    // Reset cancel flag
    isCancelledRef.current = false;

    // Build task queue: Each input image generates same aspect ratio output
    const now = Date.now();
    const taskQueue: ResultItem[] = [];
    allItems.forEach((item, imgIdx) => {
      taskQueue.push({
        id: `${item.id}-${item.aspectRatio}-${now}-${imgIdx}`,
        sourceRatio: item.aspectRatio,
        sourceIndex: imgIdx + 1,
        targetRatio: item.aspectRatio, // Exact same ratio
        originalPreviewUrl: item.previewUrl,
        resultUrl: null,
        status: 'pending',
        createdAt: now
      });
    });

    // Keep existing successful saved results and prepend new task queue
    setResults(prev => [...taskQueue, ...prev.filter(r => r.status === 'success')]);
    setStatus('processing');
    setCurrentProcessingIndex(0);
    setErrorMessage('');

    let totalBatchCost = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let processedCount = 0;

    for (let i = 0; i < taskQueue.length; i++) {
      if (isCancelledRef.current) {
        setResults(prev => prev.map((res, idx) => idx >= i && res.status === 'pending' ? {
          ...res,
          status: 'error',
          errorMessage: lang === 'sc' ? '已取消生成' : '已取消生成'
        } : res));
        break;
      }

      setCurrentProcessingIndex(i);
      
      // Find corresponding source file
      const currentTask = taskQueue[i];
      const sourceItem = allItems.find(it => currentTask.id.startsWith(it.id));
      if (!sourceItem) continue;

      // Update task status to processing
      setResults(prev => prev.map(res => res.id === currentTask.id ? { ...res, status: 'processing' } : res));

      try {
        const { imageBase64: resultUrl, assistantTokens } = await processSingleImage(sourceItem.file, currentTask.targetRatio, sourceItem.manualAnnotations);
        
        if (isCancelledRef.current) {
          setResults(prev => prev.map(res => res.id === currentTask.id ? {
            ...res,
            status: 'error',
            errorMessage: lang === 'sc' ? '已取消生成' : '已取消生成'
          } : res));
          break;
        }

        const finishedItem: ResultItem = {
          ...currentTask,
          resultUrl,
          status: 'success',
          createdAt: Date.now()
        };

        setResults(prev => prev.map(res => res.id === currentTask.id ? finishedItem : res));

        // Persist immediately into IndexedDB
        await saveSingleResult({
          id: finishedItem.id,
          sourceRatio: finishedItem.sourceRatio,
          sourceIndex: finishedItem.sourceIndex,
          targetRatio: finishedItem.targetRatio,
          originalPreviewUrl: finishedItem.originalPreviewUrl,
          resultUrl: finishedItem.resultUrl,
          status: 'success',
          createdAt: finishedItem.createdAt || Date.now()
        });

        // Calculate Cost for single generation
        const priceInfo = PRICING[modelName as keyof typeof PRICING] || PRICING['gemini-nano-banana-2.1'];
        const approxInputTextTokens = 150;
        const textCost = (approxInputTextTokens / 1000000) * priceInfo.inputTextPer1M;
        let singleCost = textCost + priceInfo.inputImageCost + (1 * priceInfo.outputImageCost);
        let itemInputTokens = priceInfo.inputImageTokens + approxInputTextTokens;
        let itemOutputTokens = priceInfo.outputImageTokens;

        if (enableAssistant && assistantTokens) {
          const asstKey = (assistantTokens.model in ASSISTANT_PRICING) 
            ? (assistantTokens.model as keyof typeof ASSISTANT_PRICING) 
            : 'gemini-3.8-flash';
          const asstPrice = ASSISTANT_PRICING[asstKey];
          const asstInCost = (assistantTokens.promptTokens / 1000000) * asstPrice.inputTextPer1M;
          const asstOutCost = (assistantTokens.candidateTokens / 1000000) * asstPrice.outputTextPer1M;
          singleCost += (asstInCost + asstOutCost);
          itemInputTokens += assistantTokens.promptTokens;
          itemOutputTokens += assistantTokens.candidateTokens;
        }

        totalBatchCost += singleCost;
        totalInputTokens += itemInputTokens;
        totalOutputTokens += itemOutputTokens;
        processedCount++;

      } catch (err: any) {
        console.error(`Error processing task ${i}:`, err);
        let msg = err.message || t.errorUnknown;
        setResults(prev => prev.map(res => res.id === currentTask.id ? {
          ...res,
          status: 'error',
          errorMessage: msg
        } : res));
      }
    }

    setStatus('success');

    if (processedCount > 0) {
      const priceInfo = PRICING[modelName as keyof typeof PRICING] || PRICING['gemini-nano-banana-2.1'];
      const nowObj = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      const dayKey = `${nowObj.getFullYear()}-${pad(nowObj.getMonth() + 1)}-${pad(nowObj.getDate())}`;
      const monthKey = `${nowObj.getFullYear()}-${pad(nowObj.getMonth() + 1)}`;

      const newRecord: HistoryRecord = {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: Date.now(),
        date: nowObj.toLocaleString(),
        dayKey,
        monthKey,
        modelName: priceInfo.name,
        assistantModel: enableAssistant ? (assistantModel === 'gemini-3.1-flash-lite' ? 'Gemini 3.1 Flash-Lite' : 'Gemini 3.8 Flash') : undefined,
        inputImages: allItems.length,
        inputTokens: totalInputTokens,
        outputImages: processedCount,
        outputTokens: totalOutputTokens,
        cost: totalBatchCost
      };
      setHistory(prev => [newRecord, ...prev]);
    }
  };

  // Helper function to call backend API for a single image and target ratio
  const processSingleImage = async (
    file: File, 
    selectedAspectRatio: string,
    manualAnnotations?: ManualAnnotation[]
  ): Promise<{ 
    imageBase64: string; 
    assistantTokens?: { model: string; promptTokens: number; candidateTokens: number; totalTokens: number } | null 
  }> => {
    const dimensionsMap: Record<string, { w: number, h: number }> = {
      '4:5': { w: 1200, h: 1500 },
      '16:9': { w: 1200, h: 675 },
      '9:16': { w: 675, h: 1200 },
      '1:1': { w: 1200, h: 1200 },
      '3:4': { w: 1242, h: 1660 }
    };
    const apiAspectRatioMap: Record<string, string> = {
      '4:5': '4:5',
      '16:9': '16:9',
      '9:16': '9:16',
      '1:1': '1:1',
      '3:4': '3:4'
    };
    const targetDims = dimensionsMap[selectedAspectRatio] || { w: 1200, h: 1500 };
    const apiAspectRatio = apiAspectRatioMap[selectedAspectRatio] || selectedAspectRatio;

    let base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = base64Data;
    });

    const prepCanvas = document.createElement('canvas');
    prepCanvas.width = targetDims.w;
    prepCanvas.height = targetDims.h;
    const prepCtx = prepCanvas.getContext('2d');
    
    if (prepCtx) {
      prepCtx.imageSmoothingEnabled = true;
      prepCtx.imageSmoothingQuality = 'high';

      let sWidth = img.width;
      let sHeight = img.height;
      let sx = 0;
      let sy = 0;
      const sRatio = sWidth / sHeight;
      const tRatio = targetDims.w / targetDims.h;
      
      if (sRatio > tRatio) {
        sWidth = sHeight * tRatio;
        sx = (img.width - sWidth) / 2;
      } else if (sRatio < tRatio) {
        sHeight = sWidth / tRatio;
        sy = (img.height - sHeight) / 2;
      }

      prepCtx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, targetDims.w, targetDims.h);

      const INPUT_MAX_BYTES = 3 * 1024 * 1024;
      const getByteSize = (base64: string) => Math.round((base64.length - 22) * 3 / 4);
      
      let quality = 0.95;
      base64Data = prepCanvas.toDataURL('image/jpeg', quality);
      while (getByteSize(base64Data) > INPUT_MAX_BYTES && quality > 0.1) {
        quality -= 0.1;
        base64Data = prepCanvas.toDataURL('image/jpeg', quality);
      }
    }
    
    const base64Content = base64Data.split(',')[1];
    const mimeType = base64Data.split(';')[0].split(':')[1];

    const res = await fetch('/api/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base64Content,
        mimeType,
        lang,
        instruction,
        modelName,
        apiAspectRatio,
        enableTextAssistant: enableAssistant,
        assistantModel,
        manualAnnotations: manualAnnotations || []
      })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || t.errorAIFail);
    }

    const data = await res.json();
    let newImageBase64 = `data:${mimeType};base64,${data.imageBase64}`;

    const exactImg = new Image();
    await new Promise((resolve, reject) => {
      exactImg.onload = resolve;
      exactImg.onerror = reject;
      exactImg.src = newImageBase64;
    });
    
    const canvas = document.createElement('canvas');
    canvas.width = targetDims.w;
    canvas.height = targetDims.h;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      
      let sWidth = exactImg.width;
      let sHeight = exactImg.height;
      let sx = 0;
      let sy = 0;
      const sRatio = sWidth / sHeight;
      const tRatio = targetDims.w / targetDims.h;
      
      if (sRatio > tRatio) {
        sWidth = sHeight * tRatio;
        sx = (exactImg.width - sWidth) / 2;
      } else if (sRatio < tRatio) {
        sHeight = sWidth / tRatio;
        sy = (exactImg.height - sHeight) / 2;
      }
      
      ctx.drawImage(exactImg, sx, sy, sWidth, sHeight, 0, 0, targetDims.w, targetDims.h);
      
      let quality = 0.95;
      const finalImage = canvas.toDataURL('image/jpeg', quality);
      newImageBase64 = finalImage;
    }

    return { 
      imageBase64: newImageBase64, 
      assistantTokens: data.assistantTokens 
    };
  };

  const downloadAllResults = () => {
    results.forEach((item, index) => {
      if (item.resultUrl) {
        const link = document.createElement('a');
        link.href = item.resultUrl;
        link.download = `translated_image_${index + 1}_${item.targetRatio.replace(':', 'x')}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    });
  };

  // Deep Edit handler: localized 5-color brush circles + global directive
  const handleApplyDeepEdit = async (params: {
    cleanImageBase64: string;
    annotatedImageBase64: string;
    colorInstructions: Record<string, string>;
    globalInstruction: string;
    modelName: string;
  }) => {
    if (!deepEditingItem) return;
    setIsDeepEditing(true);
    try {
      const response = await fetch('/api/deep-edit-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cleanImageBase64: params.cleanImageBase64,
          annotatedImageBase64: params.annotatedImageBase64,
          colorInstructions: params.colorInstructions,
          globalInstruction: params.globalInstruction,
          aspectRatio: deepEditingItem.targetRatio,
          modelName: params.modelName,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || '深度編輯任務失敗');
      }

      const data = await response.json();
      const newImageBase64 = `data:image/jpeg;base64,${data.imageBase64}`;

      const updatedItem: ResultItem = {
        ...deepEditingItem,
        resultUrl: newImageBase64,
        status: 'success',
        createdAt: Date.now(),
      };

      setResults(prev => prev.map(r => r.id === deepEditingItem.id ? updatedItem : r));
      await saveSingleResult(updatedItem as StoredResultItem);

      // Record token usage into Token Calculator
      if (data.tokens) {
        const cost = 0.03 * 7.8; // standard image output cost HK$0.234
        const nowObj = new Date();
        const pad = (n: number) => n.toString().padStart(2, '0');
        const dayKey = `${nowObj.getFullYear()}-${pad(nowObj.getMonth() + 1)}-${pad(nowObj.getDate())}`;
        const monthKey = `${nowObj.getFullYear()}-${pad(nowObj.getMonth() + 1)}`;

        const record: HistoryRecord = {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: Date.now(),
          date: nowObj.toLocaleString(),
          dayKey,
          monthKey,
          modelName: `深度編輯 (${params.modelName.includes('pro') ? 'Nano Banana Pro' : 'Nano Banana 2'})`,
          inputImages: 2,
          inputTokens: data.tokens.inputTokens,
          outputImages: 1,
          outputTokens: data.tokens.outputTokens,
          cost,
        };
        setHistory(prev => [record, ...prev]);
      }
    } finally {
      setIsDeepEditing(false);
    }
  };

  // Token calculations for single, daily, and monthly records
  const nowObj = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const currentDayKey = `${nowObj.getFullYear()}-${pad(nowObj.getMonth() + 1)}-${pad(nowObj.getDate())}`;
  const currentMonthKey = `${nowObj.getFullYear()}-${pad(nowObj.getMonth() + 1)}`;

  const todayRecords = history.filter(h => h.dayKey === currentDayKey);
  const todayTokens = todayRecords.reduce((sum, h) => sum + h.inputTokens + h.outputTokens, 0);
  const todayCost = todayRecords.reduce((sum, h) => sum + h.cost, 0);

  const monthRecords = history.filter(h => h.monthKey === currentMonthKey);
  const monthTokens = monthRecords.reduce((sum, h) => sum + h.inputTokens + h.outputTokens, 0);
  const monthCost = monthRecords.reduce((sum, h) => sum + h.cost, 0);

  const totalTokens = history.reduce((sum, h) => sum + h.inputTokens + h.outputTokens, 0);
  const totalCost = history.reduce((sum, h) => sum + h.cost, 0);

  const lastBatchRecord = history[0] || null;

  const monthlySummary = history.reduce<Record<string, { count: number; inputTokens: number; outputTokens: number; totalTokens: number; cost: number }>>((acc, item) => {
    const m = item.monthKey || 'Other';
    if (!acc[m]) {
      acc[m] = { count: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0 };
    }
    acc[m].count += 1;
    acc[m].inputTokens += item.inputTokens;
    acc[m].outputTokens += item.outputTokens;
    acc[m].totalTokens += (item.inputTokens + item.outputTokens);
    acc[m].cost += item.cost;
    return acc;
  }, {});

  return (
    <div className="h-screen w-full bg-[#F3F4F6] text-[#1F2937] font-sans flex flex-col overflow-hidden">
      {/* Top Header Bar */}
      <header className="h-16 bg-white border-b border-[#E5E7EB] flex items-center px-6 justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-[#3B82F6] to-[#2563EB] rounded-lg flex items-center justify-center text-white font-bold shadow-sm text-sm">繁简</div>
          <span className="text-[18px] font-bold tracking-tight text-gray-900">{t.title}</span>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={async () => {
              if (window.aistudio?.openSelectKey) {
                await window.aistudio.openSelectKey();
              }
            }}
            className="flex items-center justify-center bg-[#F3F4F6] border border-[#E5E7EB] w-8 h-8 rounded-lg text-gray-600 hover:bg-[#E5E7EB] transition-colors"
            title="Settings / API Key"
          >
            ⚙️
          </button>
          <button 
            onClick={() => setShowHistory(true)}
            className="flex items-center gap-2 bg-[#F0FDF4] border border-[#BBF7D0] text-[#166534] px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-[#DCFCE7] transition-colors shadow-sm"
            title="Token 計算器與歷史紀錄 (點擊開啟)"
          >
            <DollarSign className="w-4 h-4 text-emerald-600" />
            <span>今日: HK${todayCost.toFixed(4)}</span>
          </button>
          <div className="flex items-center gap-2 bg-[#F3F4F6] border border-[#E5E7EB] px-3 py-1.5 rounded-lg text-sm">
            <span className="font-medium text-gray-600">Model:</span>
            <select 
              value={modelName} 
              onChange={(e) => setModelName(e.target.value)}
              className="bg-transparent border-none text-gray-800 font-semibold focus:outline-none cursor-pointer"
            >
              <option value="gemini-nano-banana-2.1">Nano Banana 2.1</option>
              <option value="gemini-3.1-flash-image">Nano Banana 2</option>
              <option value="gemini-3-pro-image">Nano Banana Pro</option>
            </select>
          </div>
          <div className="flex items-center gap-2 bg-[#F3F4F6] border border-[#E5E7EB] px-3 py-1.5 rounded-lg text-sm">
            <Globe className="w-4 h-4 text-gray-500" />
            <select 
              value={lang} 
              onChange={(e) => setLang(e.target.value as 'sc' | 'tc')}
              className="bg-transparent border-none text-gray-800 font-medium focus:outline-none cursor-pointer"
            >
              <option value="sc">简体中文</option>
              <option value="tc">繁體中文</option>
            </select>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 flex flex-col items-center justify-start">
        <div className="max-w-6xl w-full flex flex-col gap-6">
          
          {/* Description */}
          <div className="text-center">
            <p className="text-[#6B7280] max-w-2xl mx-auto text-sm">
              {t.desc}
            </p>
          </div>

          {/* Controls Bar: Instruction & Action Buttons & Gemini 3.8 Flash Assistant */}
          <div className="bg-white p-5 rounded-2xl border border-[#E5E7EB] shadow-sm flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-sm text-gray-700 flex items-center gap-1.5 whitespace-nowrap">
                  <ImageIcon className="w-4 h-4 text-[#2563EB]" />
                  已準備圖片:
                </span>
                <span className="text-xs bg-[#EFF6FF] text-[#1D4ED8] font-bold px-3 py-1 rounded-lg border border-blue-200 shadow-2xs">
                  {totalUploadedCount} / 9 張 (保持同尺寸輸出)
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {/* Auto-OCR on Upload Toggle */}
                <div className="flex items-center gap-2 bg-emerald-50/80 border border-emerald-200 px-3 py-1.5 rounded-xl text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-emerald-900 select-none">
                    <input 
                      type="checkbox" 
                      checked={autoOcrOnUpload} 
                      onChange={(e) => setAutoOcrOnUpload(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer"
                    />
                    <Scan className="w-3.5 h-3.5 text-emerald-600" />
                    <span>上傳自動 OCR 繁體字檢測</span>
                  </label>
                </div>

                {/* Gemini 3.8 Flash / 3.1 Flash-Lite Assistant Toggle */}
                <div className="flex flex-wrap items-center gap-2.5 bg-blue-50/70 border border-blue-200 px-3 py-1.5 rounded-xl text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-blue-900 select-none">
                    <input 
                      type="checkbox" 
                      checked={enableAssistant} 
                      onChange={(e) => setEnableAssistant(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
                    />
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                    <span>{t.assistantLabel}</span>
                  </label>
                  {enableAssistant && (
                    <div className="flex items-center gap-1 pl-2 border-l border-blue-200">
                      <span className="text-gray-500 font-medium">{t.assistantModelLabel}</span>
                      <select 
                        value={assistantModel} 
                        onChange={(e) => setAssistantModel(e.target.value)}
                        className="bg-white border border-blue-300 text-blue-900 font-semibold rounded-md px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer shadow-2xs"
                      >
                        <option value="gemini-3.8-flash">Gemini 3.8 Flash (推薦・高精準)</option>
                        <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash-Lite (極速・低消耗)</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <input
                type="text"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder={t.instructionPlaceholder}
                disabled={status === 'processing' || totalUploadedCount === 0}
                className="w-full flex-1 px-4 py-2 bg-white border border-[#E5E7EB] rounded-xl text-[14px] text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-all disabled:opacity-60 shadow-xs"
              />
              
              <div className="flex items-center gap-3 w-full sm:w-auto shrink-0 justify-end">
                {status === 'processing' ? (
                  <button
                    onClick={cancelBatchProcess}
                    className="px-5 py-2 bg-red-600 text-white font-semibold rounded-xl flex items-center justify-center gap-2 hover:bg-red-700 transition-colors shadow-sm whitespace-nowrap min-w-[120px]"
                  >
                    <X className="w-4 h-4" />
                    {t.cancelBtn}
                  </button>
                ) : (
                  <button
                    onClick={startBatchProcess}
                    disabled={totalUploadedCount === 0}
                    className="px-6 py-2 bg-[#2563EB] text-white font-semibold rounded-xl flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-sm whitespace-nowrap min-w-[120px]"
                  >
                    <ArrowRight className="w-4 h-4" />
                    {t.generateBtn} ({totalUploadedCount} 張)
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Main Workspace Layout */}
          <div className="grid lg:grid-cols-2 gap-6 items-start">
            
            {/* Left Box: Multi-aspect upload tabs */}
            <div className="bg-white rounded-2xl shadow-sm border border-[#E5E7EB] flex flex-col overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E5E7EB] bg-[#F9FAFB] flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <h2 className="font-semibold text-[#374151] flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-[#6B7280]" />
                    {t.originalImg}
                  </h2>
                  <span className="text-xs bg-[#EFF6FF] text-[#1D4ED8] font-bold px-2.5 py-0.5 rounded-full border border-blue-200">
                    {t.totalUploaded}: {totalUploadedCount} / 9
                  </span>
                </div>
                {totalUploadedCount > 0 && (
                  <button onClick={clearAllUploads} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 font-medium transition-colors">
                    <Trash2 className="w-3.5 h-3.5" /> {t.reupload}
                  </button>
                )}
              </div>

              {/* Category Tabs: 4:5, 16:9, 9:16 */}
              <div className="flex border-b border-[#E5E7EB] bg-gray-50/80 px-4 pt-3 gap-2">
                {(['4:5', '16:9', '9:16'] as const).map(cat => {
                  const count = uploads[cat].length;
                  const isActive = activeTab === cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => setActiveTab(cat)}
                      className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-all flex items-center gap-2 border-t border-x ${
                        isActive 
                          ? 'bg-white text-[#2563EB] border-[#E5E7EB] border-b-white -mb-[1px] shadow-xs' 
                          : 'bg-gray-100 text-gray-500 border-transparent hover:text-gray-800'
                      }`}
                    >
                      <span>尺寸 {cat}</span>
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${count > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-500'}`}>
                        {count}/3
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Upload & Grid Area for Current Active Tab */}
              <div className="p-5 bg-[#F3F4F6] min-h-[420px] flex flex-col justify-between">
                <div className="space-y-4">
                  {/* Upload Box */}
                  {uploads[activeTab].length < 3 && (
                    <div 
                      className="w-full border-2 border-dashed border-[#D1D5DB] rounded-xl p-6 flex flex-col items-center justify-center hover:bg-gray-50 hover:border-[#3B82F6] transition-colors cursor-pointer bg-white"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (e.dataTransfer.files) handleFilesUpload(e.dataTransfer.files, activeTab);
                      }}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        multiple
                        accept="image/png, image/jpeg, image/webp" 
                        onChange={(e) => e.target.files && handleFilesUpload(e.target.files, activeTab)}
                      />
                      <div className="bg-[#DBEAFE] text-[#2563EB] p-3 rounded-full mb-2">
                        <Upload className="w-6 h-6" />
                      </div>
                      <h3 className="text-sm font-semibold text-[#374151] mb-1">
                        上傳 {activeTab} 尺寸圖片 ({t.maxPerCategory})
                      </h3>
                      <p className="text-xs text-[#6B7280]">{t.uploadDesc}</p>
                    </div>
                  )}

                  {/* Existing Uploaded Images Grid */}
                  {uploads[activeTab].length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {uploads[activeTab].map((item, idx) => {
                        const annoCount = item.manualAnnotations?.length || 0;
                        const tradCount = item.ocrTradCount ?? item.manualAnnotations?.filter(a => a.isTraditional !== false).length ?? 0;
                        const isScanning = item.ocrStatus === 'scanning';

                        return (
                          <div key={item.id} className="relative group bg-white border border-[#E5E7EB] rounded-xl p-2.5 shadow-xs flex flex-col items-center justify-between hover:border-blue-300 transition-colors">
                            {/* Card Badges */}
                            <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5 flex-wrap max-w-[80%]">
                              <span className="bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-2xs">
                                #{idx + 1}
                              </span>

                              {isScanning ? (
                                <span className="bg-blue-600/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-xs flex items-center gap-1 animate-pulse">
                                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                  OCR 掃描中...
                                </span>
                              ) : item.ocrStatus === 'done' ? (
                                tradCount > 0 ? (
                                  <span className="bg-emerald-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-xs flex items-center gap-1">
                                    <ShieldCheck className="w-2.5 h-2.5" />
                                    已高亮 {tradCount} 繁體
                                  </span>
                                ) : (
                                  <span className="bg-gray-700/80 text-white text-[10px] font-medium px-1.5 py-0.5 rounded shadow-xs">
                                    未見繁體
                                  </span>
                                )
                              ) : annoCount > 0 ? (
                                <span className="bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-xs flex items-center gap-1">
                                  <Crosshair className="w-2.5 h-2.5" />
                                  標註 {annoCount}
                                </span>
                              ) : null}
                            </div>

                            <button
                              onClick={() => removeImage(activeTab, item.id)}
                              className="absolute top-2 right-2 z-20 bg-red-500/80 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 cursor-pointer shadow-xs"
                              title="刪除"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>

                            {/* Thumbnail with Highlighted Bounding Boxes */}
                            <div 
                              className="w-full h-32 flex items-center justify-center cursor-zoom-in overflow-hidden rounded-lg bg-neutral-900/95 relative group/thumb border border-gray-100"
                              onClick={() => setEnlargedImage(item.previewUrl)}
                            >
                              <img 
                                src={item.previewUrl} 
                                alt={`Upload ${idx + 1}`} 
                                className="max-w-full max-h-full object-contain pointer-events-none" 
                              />

                              {/* Live Bounding Box Highlights on Thumbnail */}
                              {item.manualAnnotations && item.manualAnnotations.map((anno) => {
                                const isTrad = anno.isTraditional !== false;
                                const isAuto = anno.source === 'auto_ocr';
                                return (
                                  <div
                                    key={anno.id}
                                    style={{
                                      top: `${anno.boxPct.top}%`,
                                      left: `${anno.boxPct.left}%`,
                                      width: `${anno.boxPct.width}%`,
                                      height: `${anno.boxPct.height}%`,
                                    }}
                                    className={`absolute border pointer-events-none ${
                                      isAuto
                                        ? isTrad
                                          ? 'border-emerald-400 bg-emerald-400/25 ring-1 ring-emerald-300'
                                          : 'border-blue-400 bg-blue-400/20'
                                        : 'border-red-500 bg-red-500/25 ring-1 ring-red-400'
                                    }`}
                                  >
                                    <span className="absolute -top-3 left-0 text-[7px] font-bold px-0.5 rounded bg-black/85 text-white whitespace-nowrap leading-none py-0.5 pointer-events-none">
                                      {anno.originalText ? `${anno.originalText}➔${anno.targetText || '?'}` : '標註'}
                                    </span>
                                  </div>
                                );
                              })}

                              {/* Hover preview tip */}
                              <div className="absolute inset-0 bg-black/0 group-hover/thumb:bg-black/25 transition-colors flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 pointer-events-none">
                                <span className="bg-black/75 text-white text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                                  <Eye className="w-3 h-3 text-emerald-400" /> 點擊放大查看
                                </span>
                              </div>
                            </div>

                            <span className="text-[11px] font-medium text-gray-500 truncate w-full text-center mt-1 px-1">
                              {item.file.name}
                            </span>

                            {/* Actions under card */}
                            <div className="w-full mt-2 flex items-center gap-1.5">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAnnotatingItem({ categoryRatio: activeTab, item });
                                }}
                                className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                                  annoCount > 0
                                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs'
                                    : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 hover:border-blue-300 shadow-2xs'
                                }`}
                                title="進入繁體字框選與校對中心，可確認高亮文字或手動框選補齊"
                              >
                                <Crosshair className={`w-3.5 h-3.5 ${annoCount > 0 ? 'text-emerald-600' : 'text-blue-600'}`} />
                                <span className="truncate">
                                  {annoCount > 0 ? `檢視/補齊 (${annoCount}處)` : '框選繁體字 (強制轉換)'}
                                </span>
                              </button>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  runOcrScanForItem(item, activeTab);
                                }}
                                disabled={isScanning}
                                className="px-2 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200 rounded-lg text-xs flex items-center justify-center transition-colors disabled:opacity-50 cursor-pointer"
                                title="重新調用 OCR 模型掃描此圖片"
                              >
                                <RefreshCw className={`w-3.5 h-3.5 text-gray-600 ${isScanning ? 'animate-spin' : ''}`} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* OCR 文字校對列表 (展示所有偵測到的文字對應關係，支援直接在此列表修改錯誤的識別結果，作為下一次生成任務的強制引導參數) */}
                  {uploads[activeTab].length > 0 && (
                    <OcrProofreadingTable
                      items={uploads[activeTab]}
                      activeCategory={activeTab}
                      onUpdateAnnotation={handleProofreadUpdate}
                      onDeleteAnnotation={handleProofreadDelete}
                      onAddAnnotation={handleProofreadAdd}
                      onReScanOcr={(item) => runOcrScanForItem(item, activeTab)}
                      onOpenAnnotatorModal={(item) => setAnnotatingItem({ categoryRatio: activeTab, item })}
                      lang={lang}
                    />
                  )}
                </div>

                <div className="text-xs text-gray-400 text-center mt-4 border-t border-gray-200/60 pt-3">
                  提示：您可以切換頁籤，上傳 4:5、16:9、9:16 各最多 3 張圖片。
                </div>
              </div>
            </div>

            {/* Right Box: Batch Process Results */}
            <div className="bg-white rounded-2xl shadow-sm border border-[#E5E7EB] flex flex-col overflow-hidden min-h-[500px]">
              <div className="px-5 py-4 border-b border-[#E5E7EB] bg-[#F9FAFB] flex justify-between items-center flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-[#374151] flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-[#6B7280]" />
                    {t.translatedImg}
                  </h2>
                  {results.length > 0 && (
                    <span className="text-xs bg-gray-200 text-gray-700 font-bold px-2 py-0.5 rounded-full">
                      {results.length} 張{lang === 'sc' ? '已保存' : '已儲存'}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {results.length > 0 && (
                    <button
                      onClick={handleDeleteAllResults}
                      className="text-xs text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 px-3 py-1.5 rounded-md flex items-center gap-1 font-semibold transition-colors shadow-2xs cursor-pointer"
                      title={t.deleteAllResults}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {t.deleteAllResults}
                    </button>
                  )}
                  {results.some(r => r.resultUrl) && (
                    <button
                      onClick={downloadAllResults}
                      className="text-xs text-white bg-[#2563EB] hover:bg-blue-700 px-3 py-1.5 rounded-md flex items-center gap-1 font-medium transition-colors shadow-xs cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" /> {t.downloadAll}
                    </button>
                  )}
                </div>
              </div>

              <div className="p-5 bg-[#F3F4F6] flex-1 flex flex-col justify-between">
                {results.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-[#9CA3AF] py-16 gap-3">
                    <ImageIcon className="w-12 h-12 opacity-30" />
                    <span className="text-sm font-medium">{t.waiting}</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Batch Progress Bar */}
                    {status === 'processing' && (
                      <div className="bg-white p-4 rounded-xl border border-blue-200 shadow-xs space-y-2">
                        <div className="flex justify-between items-center text-xs font-semibold text-gray-700">
                          <span className="flex items-center gap-2 text-blue-600">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            {t.batchProgress}: 第 {currentProcessingIndex + 1} / {results.length} 張
                          </span>
                          <div className="flex items-center gap-3">
                            <span>{Math.round(((currentProcessingIndex + 1) / results.length) * 100)}%</span>
                            <button
                              onClick={cancelBatchProcess}
                              className="text-xs text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 px-2 py-0.5 rounded font-bold transition-colors"
                            >
                              {t.cancelBtn}
                            </button>
                          </div>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                          <div 
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                            style={{ width: `${((currentProcessingIndex + 1) / results.length) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Results Cards List */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto pr-1">
                      {results.map((item, index) => (
                        <div key={item.id} className="bg-white rounded-xl border border-gray-200 p-3 shadow-xs flex flex-col justify-between group">
                          <div className="flex justify-between items-center text-xs font-semibold mb-2">
                            <span className="text-gray-500 flex items-center gap-1">
                              尺寸: {item.sourceRatio}
                              {item.createdAt && (
                                <span className="text-[10px] text-gray-400 font-normal">
                                  ({new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                                </span>
                              )}
                            </span>
                            <div className="flex items-center gap-1.5">
                              {item.status === 'pending' && <span className="text-gray-400 bg-gray-100 px-2 py-0.5 rounded text-[11px]">排隊中</span>}
                              {item.status === 'processing' && <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded flex items-center gap-1 text-[11px]"><Loader2 className="w-3 h-3 animate-spin"/> 生成中</span>}
                              {item.status === 'success' && <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded flex items-center gap-1 text-[11px]"><Check className="w-3 h-3"/> 完成</span>}
                              {item.status === 'error' && <span className="text-red-500 bg-red-50 px-2 py-0.5 rounded text-[11px]">失敗</span>}
                              
                              <button
                                onClick={() => handleDeleteSingleResult(item.id)}
                                className="text-gray-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors ml-0.5 cursor-pointer"
                                title={t.deleteSingle}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="w-full h-44 bg-gray-50 rounded-lg border border-gray-100 flex items-center justify-center relative overflow-hidden group">
                            {item.status === 'processing' && (
                              <div className="flex flex-col items-center gap-2 text-xs text-blue-600">
                                <Loader2 className="w-6 h-6 animate-spin" />
                                <span>AI 繪製中...</span>
                              </div>
                            )}

                            {item.status === 'error' && (
                              <div className="p-3 text-center text-red-500 text-xs flex flex-col items-center gap-1">
                                <AlertCircle className="w-5 h-5 text-red-400" />
                                <span className="line-clamp-3">{item.errorMessage || '生成失敗'}</span>
                              </div>
                            )}

                            {item.resultUrl && (
                              <div className="w-full h-full flex items-center justify-center relative group/img cursor-pointer" onClick={() => setDeepEditingItem(item)}>
                                <img src={item.resultUrl} alt="Result" className="max-w-full max-h-full object-contain" />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeepEditingItem(item);
                                    }}
                                    className="bg-purple-600 hover:bg-purple-700 text-white text-xs px-3 py-1.5 rounded-lg font-semibold shadow-md flex items-center gap-1.5 transition-transform hover:scale-105 cursor-pointer"
                                  >
                                    <Palette className="w-3.5 h-3.5" />
                                    深度編輯
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEnlargedImage(item.resultUrl);
                                    }}
                                    className="bg-white/90 hover:bg-white text-gray-800 text-xs px-2.5 py-1.5 rounded-lg font-medium shadow-md flex items-center gap-1 transition-transform hover:scale-105 cursor-pointer"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    放大
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>

                          {item.resultUrl && (
                            <div className="mt-3 flex items-center gap-2">
                              <button
                                onClick={() => setDeepEditingItem(item)}
                                className="flex-1 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                                title="點擊進行深度編輯：支援5色筆觸局部圈選與全局文字編輯指令"
                              >
                                <Palette className="w-3.5 h-3.5 text-purple-600" />
                                深度編輯 (筆觸圈選)
                              </button>
                              <a
                                href={item.resultUrl}
                                download={`translated_${index + 1}_${item.targetRatio.replace(':', 'x')}.jpg`}
                                className="py-1.5 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg flex items-center justify-center gap-1 transition-colors"
                                title={t.downloadSingle}
                              >
                                <Download className="w-3.5 h-3.5" />
                              </a>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Full-screen Image Modal */}
      <AnimatePresence>
        {enlargedImage && (() => {
          const matchingUploadItem = (['4:5', '16:9', '9:16'] as const).flatMap(cat => 
            uploads[cat].map(it => ({ cat, item: it }))
          ).find(x => x.item.previewUrl === enlargedImage);

          return (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4 md:p-8 backdrop-blur-sm"
              onClick={() => setEnlargedImage(null)}
            >
              <div className="absolute top-6 left-6 z-10 flex items-center gap-3">
                {matchingUploadItem && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const targetItem = matchingUploadItem;
                      setEnlargedImage(null);
                      setAnnotatingItem({ categoryRatio: targetItem.cat, item: targetItem.item });
                    }}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg transition-all cursor-pointer"
                  >
                    <Crosshair className="w-4 h-4" />
                    <span>
                      框選繁體字區域 (強制轉換) {matchingUploadItem.item.manualAnnotations?.length ? `[已標註 ${matchingUploadItem.item.manualAnnotations.length} 處]` : ''}
                    </span>
                  </button>
                )}
              </div>

              <button 
                className="absolute top-6 right-6 text-white/70 hover:text-white bg-black/50 hover:bg-black/80 rounded-full p-2 transition-all cursor-pointer"
                onClick={() => setEnlargedImage(null)}
              >
                <X className="w-6 h-6" />
              </button>
              <img 
                src={enlargedImage} 
                alt="Enlarged" 
                className="max-w-full max-h-full object-contain select-none shadow-2xl rounded-sm" 
                onClick={(e) => e.stopPropagation()} 
              />
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* History Modal */}
      <AnimatePresence>
        {showHistory && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex flex-col items-center justify-center p-4 backdrop-blur-sm"
            onClick={() => setShowHistory(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="px-6 py-4 border-b border-[#E5E7EB] flex items-center justify-between bg-[#F9FAFB]">
                <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                  <History className="w-5 h-5 text-gray-500" />
                  {t.tokenCounter} 與費用統計
                </h3>
                <div className="flex items-center gap-3">
                  {history.length > 0 && (
                    <button
                      onClick={() => {
                        if (window.confirm(t.confirmClearHistory)) {
                          setHistory([]);
                          localStorage.removeItem('transchar_token_history');
                        }
                      }}
                      className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 font-medium transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {t.clearHistoryBtn}
                    </button>
                  )}
                  <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-gray-600 transition">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="p-6 overflow-y-auto flex-1 bg-gray-50 space-y-6">
                {/* 3 Metric Cards: Single Job, Today, This Month */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                  {/* Single Job */}
                  <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex flex-col justify-between">
                    <div className="flex items-center justify-between text-xs font-semibold text-gray-500 mb-2">
                      <span className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5 text-blue-500" /> {t.lastBatchCost}</span>
                      <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-mono">本次/上次</span>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-gray-900">
                        HK${lastBatchRecord ? lastBatchRecord.cost.toFixed(4) : '0.0000'}
                      </div>
                      <div className="text-xs text-gray-500 mt-1 font-mono">
                        {lastBatchRecord ? (lastBatchRecord.inputTokens + lastBatchRecord.outputTokens).toLocaleString() : 0} Tokens
                      </div>
                    </div>
                  </div>

                  {/* Today */}
                  <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-xs flex flex-col justify-between bg-gradient-to-br from-emerald-50/40 to-white">
                    <div className="flex items-center justify-between text-xs font-semibold text-emerald-800 mb-2">
                      <span className="flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-emerald-600" /> {t.todayCost}</span>
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-mono">今日</span>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-emerald-700">
                        HK${todayCost.toFixed(4)}
                      </div>
                      <div className="text-xs text-gray-500 mt-1 font-mono flex items-center justify-between">
                        <span>{todayTokens.toLocaleString()} Tokens</span>
                        <span className="text-gray-400">{todayRecords.length} 次工作</span>
                      </div>
                    </div>
                  </div>

                  {/* This Month */}
                  <div className="bg-white p-4 rounded-xl border border-blue-200 shadow-xs flex flex-col justify-between bg-gradient-to-br from-blue-50/40 to-white">
                    <div className="flex items-center justify-between text-xs font-semibold text-blue-800 mb-2">
                      <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-blue-600" /> {t.monthCost}</span>
                      <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-mono">{currentMonthKey}</span>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-blue-700">
                        HK${monthCost.toFixed(4)}
                      </div>
                      <div className="text-xs text-gray-500 mt-1 font-mono flex items-center justify-between">
                        <span>{monthTokens.toLocaleString()} Tokens</span>
                        <span className="text-gray-400">{monthRecords.length} 次工作</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pricing Reference Card */}
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs space-y-3">
                  <div className="text-xs font-bold text-gray-700 flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-emerald-600" />
                    <span>模型定價標準 (HKD)</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                    <div className="space-y-1.5">
                      <div className="font-semibold text-gray-600 text-xs">圖像生成模型 (Image Models):</div>
                      <div className="bg-gray-50 p-2 rounded border border-gray-100 flex justify-between">
                        <span className="font-semibold text-gray-800">Nano Banana 2.1 (預設)</span>
                        <span className="text-gray-600">入 ~$0.0047 · 出 ~$0.7878 /圖</span>
                      </div>
                      <div className="bg-gray-50 p-2 rounded border border-gray-100 flex justify-between">
                        <span className="font-semibold text-gray-800">Nano Banana 2</span>
                        <span className="text-gray-600">入 ~$0.0047 · 出 ~$0.7878 /圖</span>
                      </div>
                      <div className="bg-gray-50 p-2 rounded border border-gray-100 flex justify-between">
                        <span className="font-semibold text-gray-800">Nano Banana Pro</span>
                        <span className="text-gray-600">入 ~$0.0086 · 出 ~$1.0452 /圖</span>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="font-semibold text-gray-600 text-xs">雙階段文字輔助推理 (Text & OCR):</div>
                      <div className="bg-blue-50/70 p-2 rounded border border-blue-100 flex justify-between">
                        <div>
                          <div className="font-semibold text-blue-900">Gemini 3.8 Flash (推薦)</div>
                          <div className="text-[10px] text-blue-700">高精準視覺推理 OCR 護標</div>
                        </div>
                        <span className="text-blue-800 font-mono text-right">入 $0.585 / 1M<br/>出 $2.34 / 1M</span>
                      </div>
                      <div className="bg-gray-50 p-2 rounded border border-gray-100 flex justify-between">
                        <div>
                          <div className="font-semibold text-gray-800">Gemini 3.1 Flash-Lite</div>
                          <div className="text-[10px] text-gray-500">極速輕量節省成本</div>
                        </div>
                        <span className="text-gray-600 font-mono text-right">入 $0.2925 / 1M<br/>出 $1.17 / 1M</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Monthly Archives Summary */}
                {Object.keys(monthlySummary).length > 0 && (
                  <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
                    <h4 className="text-xs font-bold text-gray-700 mb-3 flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-blue-500" />
                      {t.monthlyRecord}
                    </h4>
                    <div className="divide-y divide-gray-100">
                      {Object.entries(monthlySummary).map(([mKey, summary]: [string, any]) => (
                        <div key={mKey} className="py-2 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-gray-800 bg-gray-100 px-2 py-0.5 rounded">{mKey}</span>
                            <span className="text-gray-500">{summary.count} 次工作</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-gray-500 font-mono">{summary.totalTokens.toLocaleString()} Tokens</span>
                            <span className="font-bold text-gray-900 font-mono">HK${summary.cost.toFixed(4)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Job History List */}
                <div>
                  <h4 className="text-xs font-bold text-gray-700 mb-3 px-1 flex items-center gap-1.5">
                    <History className="w-4 h-4 text-gray-500" />
                    詳細生成明細
                  </h4>
                  <div className="space-y-2.5">
                    {history.length === 0 ? (
                      <div className="text-center text-gray-400 py-8 text-sm bg-white rounded-xl border border-dashed border-gray-200">
                        尚無圖片生成紀錄
                      </div>
                    ) : (
                      history.map(item => (
                        <div key={item.id} className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="space-y-1">
                            <div className="font-semibold text-gray-800 text-xs flex flex-wrap items-center gap-2">
                              <span>{item.modelName}</span>
                              {item.assistantModel && (
                                <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] px-1.5 py-0.2 rounded font-medium flex items-center gap-1">
                                  <Sparkles className="w-3 h-3 text-blue-500" />
                                  {item.assistantModel}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-gray-400">{item.date}</div>
                          </div>
                          <div className="flex items-center justify-between sm:justify-end gap-4 text-xs">
                            <div className="text-gray-500 text-[11px] text-right font-mono">
                              <div>入: {item.inputTokens.toLocaleString()} T</div>
                              <div>出: {item.outputTokens.toLocaleString()} T</div>
                            </div>
                            <div className="font-bold text-[#2563EB] bg-blue-50/80 px-2.5 py-1.5 rounded-lg min-w-[75px] text-center border border-blue-100 font-mono text-xs">
                              HK${item.cost.toFixed(4)}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Interactive Bounding Box Annotator Tool */}
      {annotatingItem && (
        <ImageAnnotatorModal
          isOpen={!!annotatingItem}
          onClose={() => setAnnotatingItem(null)}
          imageUrl={annotatingItem.item.previewUrl}
          fileName={annotatingItem.item.file.name}
          initialAnnotations={annotatingItem.item.manualAnnotations || []}
          onSave={(annotations) => {
            handleSaveAnnotations(annotatingItem.categoryRatio, annotatingItem.item.id, annotations);
            setAnnotatingItem(null);
          }}
          lang={lang}
          isOcrScanning={annotatingItem.item.ocrStatus === 'scanning'}
          assistantModel={assistantModel}
          onAssistantModelChange={(m) => setAssistantModel(m)}
          onTriggerOcr={async (model) => {
            const detected = await runOcrScanForItem(annotatingItem.item, annotatingItem.categoryRatio, model);
            return detected;
          }}
        />
      )}

      {/* Deep Image Editor Modal (5-color brush circles + global directive) */}
      {deepEditingItem && deepEditingItem.resultUrl && (
        <ImageDeepEditModal
          isOpen={!!deepEditingItem}
          onClose={() => setDeepEditingItem(null)}
          imageUrl={deepEditingItem.resultUrl}
          sourceRatio={deepEditingItem.sourceRatio}
          targetRatio={deepEditingItem.targetRatio}
          onApplyEdit={handleApplyDeepEdit}
          isProcessing={isDeepEditing}
        />
      )}

      {/* Delete All Confirmation Dialog */}
      {showDeleteAllConfirm && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setShowDeleteAllConfirm(false)}
        >
          <div 
            className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-gray-200 space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-red-100 rounded-xl text-red-600 shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-sm">
                  {lang === 'sc' ? '确定清空所有转换结果？' : '確定清空所有轉換結果？'}
                </h3>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  {lang === 'sc' 
                    ? '此操作将从界面与本地数据库中永久删除所有已生成的图片结果，此操作无法复原。' 
                    : '此操作將從介面與本地資料庫中永久刪除所有已生成的圖片結果，此操作無法復原。'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowDeleteAllConfirm(false)}
                className="px-3.5 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition cursor-pointer"
              >
                {t.cancelBtn}
              </button>
              <button
                type="button"
                onClick={confirmDeleteAllResults}
                className="px-4 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-2xs transition cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {lang === 'sc' ? '确认清空' : '確認清空'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
