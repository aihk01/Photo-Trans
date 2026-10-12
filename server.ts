import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import cors from 'cors';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  app.post('/api/generate-image', async (req, res) => {
    try {
      const { 
        base64Content, 
        mimeType, 
        lang, 
        instruction, 
        modelName, 
        apiAspectRatio,
        enableTextAssistant = true,
        assistantModel = 'gemini-3.8-flash'
      } = req.body;

      if (!process.env.GEMINI_API_KEY) {
        return res.status(401).json({ error: 'API_KEY_INVALID' });
      }

      // Normalize modelName to the canonical/supported version
      let apiModelName = modelName || 'gemini-nano-banana-2.1';
      if (apiModelName === 'gemini-3.1-flash-image-preview') {
        apiModelName = 'gemini-3.1-flash-image';
      } else if (apiModelName === 'gemini-3-pro-image-preview') {
        apiModelName = 'gemini-3-pro-image';
      }

      const ai = new GoogleGenAI({ 
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      // Stage 1: Optional Gemini 3.8 Flash / Gemini 3.1 Flash-Lite OCR & Translation Assistant
      let assistantResult = '';
      let assistantTokens = {
        model: assistantModel === 'gemini-3.1-flash-lite' ? 'gemini-3.1-flash-lite' : 'gemini-3.8-flash',
        promptTokens: 0,
        candidateTokens: 0,
        totalTokens: 0,
      };

      if (enableTextAssistant !== false) {
        const actualAssistantModel = assistantModel === 'gemini-3.1-flash-lite' ? 'gemini-3.1-flash-lite' : 'gemini-3.8-flash';
        try {
          const assistantPrompt = `You are a professional Chinese typography expert, OCR scanner, and localization translator.
Task:
1. Scan and detect ALL visible text in this image (headlines, subheadlines, body copy, floating labels, stickers, taglines).
2. LOGO DETECTION & PRESERVATION:
   - Identify any Brand Logo, Corporate Badge, or Watermark in the TOP-LEFT corner or header area.
   - Designate these as STRICTLY PROTECTED (DO NOT ALTER/REDRAW/TRANSLATE).
3. TRANSLATION MATRIX:
   - For all targeted text, produce an exact 1-to-1 character replacement matrix ${lang === 'sc' ? 'from Traditional Chinese to standard Simplified Chinese (通用规范汉字)' : 'from Simplified Chinese to standard Traditional Chinese (规范繁体字)'}.
   - CRITICAL: Pay extreme attention to surnames, titles, and radical-simplified characters that diffusion models frequently miss or fail to convert (e.g. 譚 -> 谭, 鄧 -> 邓, 劉 -> 刘, 鄭 -> 郑, 蘇 -> 苏, 羅 -> 罗, 觀 -> 观, 聽 -> 听, 講 -> 讲, 讓 -> 让, 變 -> 变, 體 -> 体, 點 -> 点).
   - Ensure 100% conversion accuracy: no characters skipped, no mixed simplified/traditional forms.

Format your output as:
[PROTECTED LOGOS - DO NOT TOUCH]
- [Detected logos/watermarks, especially in top-left, or "None"]

[EXACT TEXT REPLACEMENTS]
- Original: "..." -> Target: "..."
- Original: "..." -> Target: "..."

[CHARACTER-BY-CHARACTER RADICAL ENFORCEMENT]
- Highlight key characters that require radical changes (e.g. "譚" MUST be simplified to "谭" with 讠 radical; not 譚)

[TYPOGRAPHY STYLES & POSITION]
- [Brief notes on font weight, bold/italic, color, glow/shadow, placement]`;

          const assistantRes = await ai.models.generateContent({
            model: actualAssistantModel,
            contents: {
              parts: [
                {
                  inlineData: {
                    data: base64Content,
                    mimeType: mimeType,
                  },
                },
                {
                  text: assistantPrompt,
                },
              ],
            },
          });

          assistantResult = assistantRes.text || '';
          if (assistantRes.usageMetadata) {
            assistantTokens.promptTokens = assistantRes.usageMetadata.promptTokenCount || 0;
            assistantTokens.candidateTokens = assistantRes.usageMetadata.candidatesTokenCount || 0;
            assistantTokens.totalTokens = assistantRes.usageMetadata.totalTokenCount || 0;
          } else {
            assistantTokens.promptTokens = Math.ceil(assistantPrompt.length / 4) + 1120;
            assistantTokens.candidateTokens = Math.ceil(assistantResult.length / 4);
            assistantTokens.totalTokens = assistantTokens.promptTokens + assistantTokens.candidateTokens;
          }
        } catch (err: any) {
          console.warn('Text assistant OCR stage warning:', err?.message || err);
        }
      }

      let promptText = '';
      if (assistantResult) {
        promptText = `### MANDATORY IMAGE LOCALIZATION & TEXT INPAINTING TASK:
You must ERASE the original Chinese text in this image and INPAINT the following ${lang === 'sc' ? 'SIMPLIFIED CHINESE (规范简体字)' : 'TRADITIONAL CHINESE (规范繁体字)'} text exactly:

${assistantResult.trim()}

STRICT EXECUTION DIRECTIVES:
1. INPAINT & ERASE ORIGINAL STROKES:
   - Completely wipe out the original traditional characters' strokes at their locations.
   - DO NOT trace or leave any trace of the original traditional strokes due to visual inertia.
   - Re-render the target ${lang === 'sc' ? 'Simplified' : 'Traditional'} characters with 100% clean, standard Chinese typography.
2. 100% RADICAL & STROKE CONVERSION:
   - Every single word must be converted. Absolutely NO residual traditional strokes or unsimplified radicals (e.g. 谭 not 譚, 讠 not 言, 门 not 門, 车 not 車, 贝 not 貝, 观 not 觀, 让 not 讓).
   - If a word is a surname or title (e.g. 譚 -> 谭, 鄧 -> 邓, 劉 -> 刘), it MUST be rendered in simplified characters.
3. TYPOGRAPHIC STYLE & EFFECTS:
   - Match the exact font weight (Bold/Black), font family (HeiTi/SongTi), gradient fills, stroke outlines, drop shadows, 3D extrusions, and tilt angles of the original design.
4. ABSOLUTE BRAND LOGO PRESERVATION:
   - NEVER touch, redraw, modify, or translate any Brand Logo, Corporate Badge, or Watermark in the TOP-LEFT corner or header area.
5. BACKGROUND INTEGRITY:
   - Preserve all photography, characters, backgrounds, textures, and borders 100% identical. 1K resolution crisp output.`;
      } else {
        promptText = `You are a professional graphic designer and image editor specializing in Chinese typography and visual localization.
Your single objective is to translate and replace the Chinese text in this image while keeping everything else 100% identical.

TASK:
${lang === 'sc' 
  ? 'Translate all Traditional Chinese headline, title, subtitles, banners, taglines, and body text into standard Simplified Chinese (规范简体字 / 通用规范汉字标准).' 
  : 'Translate all Simplified Chinese headline, title, subtitles, banners, taglines, and body text into standard Traditional Chinese (标准繁体字 / 正体中文).'}

CRITICAL RULES:
1. ABSOLUTE BRAND LOGO PRESERVATION:
   - NEVER touch, redraw, alter, remove, or translate any brand logo, corporate icon, badge, emblem, or watermark (especially the logo in the TOP-LEFT corner or header).
2. CHINESE CHARACTER RENDERING ACCURACY & STROKE INTEGRITY:
   - 100% Complete Translation: Every single targeted Chinese word must be translated.
   - Erase old traditional strokes completely (e.g. 譚 -> 谭, 講 -> 讲, 觀 -> 观, 體 -> 体).
3. TYPOGRAPHIC STYLE MATCHING:
   - Match the exact font family, weight, stroke color, gradient fills, outer glows, drop shadows, and spacing.
4. COMPOSITION & BACKGROUND INTEGRITY:
   - Preserve all photography, characters, and textures exactly as in the original image. Output 1K resolution.`;
      }

      if (instruction) {
        promptText += `\n\nADDITIONAL USER INSTRUCTION:\n${instruction.trim()}`;
      }

      const generateConfig: any = {
        imageConfig: {
          aspectRatio: apiAspectRatio,
          imageSize: '1K'
        }
      };

      // Enable high thinking reasoning for Gemini 3 series image models to plan complex character glyphs
      if (apiModelName === 'gemini-nano-banana-2.1' || apiModelName.startsWith('gemini-3')) {
        generateConfig.thinkingConfig = {
          thinkingLevel: ThinkingLevel.HIGH
        };
      }

      let response;
      try {
        response = await ai.models.generateContent({
          model: apiModelName,
          contents: {
            parts: [
              {
                inlineData: {
                  data: base64Content,
                  mimeType: mimeType,
                },
              },
              {
                text: promptText,
              },
            ],
          },
          config: generateConfig
        });
      } catch (err: any) {
        const errMsg = err?.message || '';
        // If thinkingConfig is not supported or model not found, gracefully retry with standard config
        if (generateConfig.thinkingConfig && (errMsg.includes('thinkingConfig') || errMsg.includes('thinkingLevel') || errMsg.includes('INVALID_ARGUMENT'))) {
          console.warn('Retrying without thinkingConfig:', errMsg);
          delete generateConfig.thinkingConfig;
          response = await ai.models.generateContent({
            model: apiModelName,
            contents: {
              parts: [
                {
                  inlineData: {
                    data: base64Content,
                    mimeType: mimeType,
                  },
                },
                {
                  text: promptText,
                },
              ],
            },
            config: generateConfig
          });
        } else if (apiModelName === 'gemini-nano-banana-2.1' && (errMsg.includes('not found') || errMsg.includes('404') || errMsg.includes('is not supported'))) {
          console.warn('Falling back from gemini-nano-banana-2.1 to gemini-3.1-flash-image:', errMsg);
          response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-image',
            contents: {
              parts: [
                {
                  inlineData: {
                    data: base64Content,
                    mimeType: mimeType,
                  },
                },
                {
                  text: promptText,
                },
              ],
            },
            config: {
              imageConfig: {
                aspectRatio: apiAspectRatio,
                imageSize: '1K'
              }
            }
          });
        } else {
          throw err;
        }
      }

      let responseBase64 = '';
      let textParts: string[] = [];
      const candidates = response.candidates;
      if (candidates && candidates.length > 0) {
        const parts = candidates[0].content?.parts || [];
        for (const part of parts) {
          if (part.inlineData && part.inlineData.data) {
            responseBase64 = part.inlineData.data;
            break;
          } else if (part.text) {
            textParts.push(part.text);
          }
        }
      }

      if (!responseBase64) {
        if (textParts.length > 0) {
          throw new Error(`No image was returned from the model. Message: ${textParts.join(' ')}`);
        }
        throw new Error('No image was returned from the model');
      }

      const approxInputTextTokens = Math.ceil(promptText.length / 4);
      res.json({ 
        imageBase64: responseBase64, 
        approxInputTextTokens,
        assistantTokens: enableTextAssistant !== false && assistantTokens.totalTokens > 0 ? assistantTokens : null,
        assistantSummary: assistantResult ? assistantResult.substring(0, 300) : null
      });
    } catch (error: any) {
      const errorMsg = error.message || '';
      
      // If the error is about an invalid API key, return a clean 401 error and avoid a scary stack trace
      if (errorMsg.includes('API_KEY_INVALID') || errorMsg.includes('API key not valid')) {
        console.warn('Gemini API Warning: The provided API key is invalid.');
        return res.status(401).json({ error: 'API_KEY_INVALID' });
      }

      console.error('Gemini API Error:', error);
      res.status(500).json({ error: errorMsg || 'Internal Server Error' });
    }
  });

  // Dedicated Deep Edit endpoint supporting 5-color brush circles, localized instructions, and global directive
  app.post('/api/deep-edit-image', async (req, res) => {
    try {
      const { 
        cleanImageBase64, 
        annotatedImageBase64,
        colorInstructions = {},
        globalInstruction = '',
        aspectRatio = '1:1',
        modelName = 'gemini-nano-banana-2.1'
      } = req.body;

      if (!process.env.GEMINI_API_KEY) {
        return res.status(401).json({ error: 'API_KEY_INVALID' });
      }

      if (!cleanImageBase64) {
        return res.status(400).json({ error: 'Missing image content' });
      }

      let apiModelName = modelName || 'gemini-nano-banana-2.1';
      if (apiModelName === 'gemini-3-pro-image-preview') {
        apiModelName = 'gemini-3-pro-image';
      }

      const ai = new GoogleGenAI({ 
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      // Map color instructions
      const colorPrompts: string[] = [];
      const colorMap: Record<string, string> = {
        red: 'RED (紅色)',
        green: 'GREEN (綠色)',
        blue: 'BLUE (藍色)',
        yellow: 'YELLOW (黃色)',
        purple: 'PURPLE (紫色)'
      };

      for (const [colKey, instr] of Object.entries(colorInstructions)) {
        if (typeof instr === 'string' && instr.trim()) {
          const colorLabel = colorMap[colKey] || colKey.toUpperCase();
          colorPrompts.push(`- [${colorLabel} CIRCLED / BRUSH-MARKED REGION]: ${instr.trim()}`);
        }
      }

      const promptText = `You are a world-class digital image retoucher, graphic designer, and visual localization editor.
TASK: Perform localized precision inpainting, typography corrections, and visual modifications on the base image according to the annotated guide image and the instructions below.

IMAGE ROLES:
- Image 1: The clean base image to be retouched and edited.
- Image 2: The annotated guide image. The user has drawn 5-color brush strokes/circles (2px-8px width) marking specific areas to edit.

LOCALIZED EDIT DIRECTIVES BY COLOR BRUSH:
${colorPrompts.length > 0 ? colorPrompts.join('\n') : 'No localized marks specified; follow the global directive.'}

GLOBAL EDIT DIRECTIVE:
${globalInstruction ? globalInstruction.trim() : 'Preserve all typography, textures, and composition with 100% fidelity on untouched regions.'}

STRICT EXECUTION DIRECTIVES:
1. MANDATORY ERASURE OF BRUSH STROKES:
   - ERASE ALL red, green, blue, yellow, and purple brush strokes and marks completely.
   - The final output image must be a 100% clean, seamless graphic with absolutely NO brush lines, overlays, or annotations remaining.
2. UNTOUCHED BACKGROUND INTEGRITY:
   - Every single area outside the user's marked regions must remain 100% identical to Image 1.
3. TYPOGRAPHY AND RADICAL ACCURACY:
   - If correcting or editing Chinese characters, ensure 100% correct stroke structure and standard Chinese typography.
4. ABSOLUTE BRAND LOGO PRESERVATION:
   - NEVER alter, redraw, or delete any Brand Logo, Corporate Badge, or Watermark in the header or corners.
5. NO CYBERPUNK STYLING:
   - Maintain natural, professional, high-fidelity visual styling. Output in 1K resolution.`;

      // Build contents parts: Clean image + Guide image + Prompt text
      const parts: any[] = [
        {
          inlineData: {
            data: cleanImageBase64,
            mimeType: 'image/jpeg',
          },
        },
      ];

      // If user drew marks, add the annotated guide image as second visual part
      if (annotatedImageBase64 && annotatedImageBase64 !== cleanImageBase64) {
        parts.push({
          inlineData: {
            data: annotatedImageBase64,
            mimeType: 'image/jpeg',
          },
        });
      }

      parts.push({
        text: promptText,
      });

      let response;
      try {
        response = await ai.models.generateContent({
          model: apiModelName,
          contents: {
            parts,
          },
          config: {
            imageConfig: {
              aspectRatio: aspectRatio === '4:5' ? '4:5' : aspectRatio === '16:9' ? '16:9' : aspectRatio === '9:16' ? '9:16' : aspectRatio === '3:4' ? '3:4' : '1:1',
              imageSize: '1K',
            },
          },
        });
      } catch (err: any) {
        const errMsg = err?.message || '';
        if (apiModelName === 'gemini-nano-banana-2.1' && (errMsg.includes('not found') || errMsg.includes('404') || errMsg.includes('is not supported'))) {
          console.warn('Falling back from gemini-nano-banana-2.1 to gemini-3.1-flash-image for deep edit');
          response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-image',
            contents: {
              parts,
            },
            config: {
              imageConfig: {
                aspectRatio: aspectRatio === '4:5' ? '4:5' : aspectRatio === '16:9' ? '16:9' : aspectRatio === '9:16' ? '9:16' : aspectRatio === '3:4' ? '3:4' : '1:1',
                imageSize: '1K',
              },
            },
          });
        } else {
          throw err;
        }
      }

      let responseBase64 = '';
      const candidates = response.candidates;
      if (candidates && candidates.length > 0) {
        const cParts = candidates[0].content?.parts || [];
        for (const p of cParts) {
          if (p.inlineData && p.inlineData.data) {
            responseBase64 = p.inlineData.data;
            break;
          }
        }
      }

      if (!responseBase64) {
        throw new Error('模型未返回圖像資料');
      }

      const approxInputTokens = Math.ceil(promptText.length / 4) + 500;
      res.json({
        imageBase64: responseBase64,
        tokens: {
          model: apiModelName,
          inputTokens: approxInputTokens,
          outputTokens: 1024,
          totalTokens: approxInputTokens + 1024,
        }
      });
    } catch (error: any) {
      console.error('Deep edit image API Error:', error);
      res.status(500).json({ error: error.message || '深度編輯任務失敗' });
    }
  });

  // Dedicated OCR scan endpoint for Traditional Chinese detection and bounding box localization
  app.post('/api/scan-ocr', async (req, res) => {
    try {
      const { 
        base64Content, 
        mimeType, 
        modelName = 'gemini-3.8-flash'
      } = req.body;

      if (!process.env.GEMINI_API_KEY) {
        return res.status(401).json({ error: 'API_KEY_INVALID' });
      }

      if (!base64Content) {
        return res.status(400).json({ error: 'Missing image content' });
      }

      const ai = new GoogleGenAI({ 
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const ocrModel = modelName === 'gemini-3.1-flash-lite' ? 'gemini-3.1-flash-lite' : 'gemini-3.8-flash';

      const prompt = `You are a high-precision OCR and Chinese typography localization engine.
Thoroughly scan the uploaded image and detect ALL visible Chinese text blocks, characters, names, signs, badges, or titles.
Pay special attention to Traditional Chinese characters (繁體中文, e.g., 譚, 鄧, 國, 華, 體, 讓, 點, 門, 經, 會, 報, 訊, 業, 發, 廣, 區, 港, etc.).

For every Chinese text segment or word found in the image:
1. Provide the exact normalized 2D bounding box on a 0 to 1000 integer scale: [ymin, xmin, ymax, xmax] (ymin = top, xmin = left, ymax = bottom, xmax = right).
2. Transcribe the exact original text visible in the image ("originalText").
3. Determine whether the original text contains Traditional Chinese characters that should be converted to Simplified Chinese ("isTraditional": true or false).
4. Provide the standard Simplified Chinese conversion ("targetText").
5. Provide a short label for the element ("label", e.g. "人物姓名", "主標題", "副標題", "標籤", "印章/角落文字").

Return ONLY valid JSON matching this schema:
{
  "regions": [
    {
      "box2d": [ymin, xmin, ymax, xmax],
      "originalText": "...",
      "targetText": "...",
      "isTraditional": true,
      "confidence": "high",
      "label": "..."
    }
  ]
}`;

      const ocrResponse = await ai.models.generateContent({
        model: ocrModel,
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Content,
                mimeType: mimeType || 'image/jpeg',
              },
            },
            {
              text: prompt,
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              regions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    box2d: {
                      type: Type.ARRAY,
                      items: { type: Type.INTEGER },
                      description: "Normalized 2D box [ymin, xmin, ymax, xmax] on a 0 to 1000 scale"
                    },
                    originalText: {
                      type: Type.STRING,
                      description: "Exact Chinese text found in image"
                    },
                    targetText: {
                      type: Type.STRING,
                      description: "Standard Simplified Chinese translation"
                    },
                    isTraditional: {
                      type: Type.BOOLEAN,
                      description: "True if contains Traditional Chinese characters"
                    },
                    confidence: {
                      type: Type.STRING,
                      description: "high, medium, or low"
                    },
                    label: {
                      type: Type.STRING,
                      description: "Category label"
                    }
                  },
                  required: ["box2d", "originalText", "targetText"]
                }
              }
            },
            required: ["regions"]
          },
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW
          }
        }
      });

      const rawText = ocrResponse.text || '';
      let parsedData: { regions?: any[] } = { regions: [] };
      try {
        const cleanedText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
        parsedData = JSON.parse(cleanedText);
      } catch (parseErr) {
        console.warn('OCR response JSON parse failed, rawText:', rawText);
        const match = rawText.match(/\{[\s\S]*"regions"[\s\S]*\}/);
        if (match) {
          try {
            parsedData = JSON.parse(match[0]);
          } catch {}
        }
      }

      // Filter and sanitize regions
      const sanitizedRegions = (Array.isArray(parsedData.regions) ? parsedData.regions : [])
        .map((r: any, idx: number) => {
          if (!Array.isArray(r.box2d) || r.box2d.length !== 4) return null;
          const [ymin, xmin, ymax, xmax] = r.box2d.map((val: any) => Math.max(0, Math.min(1000, Number(val) || 0)));
          if (ymax <= ymin || xmax <= xmin) return null;
          return {
            id: `ocr_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
            box2d: [ymin, xmin, ymax, xmax] as [number, number, number, number],
            boxPct: {
              top: (ymin / 1000) * 100,
              left: (xmin / 1000) * 100,
              width: ((xmax - xmin) / 1000) * 100,
              height: ((ymax - ymin) / 1000) * 100,
            },
            originalText: String(r.originalText || '').trim(),
            targetText: String(r.targetText || '').trim(),
            isTraditional: Boolean(r.isTraditional !== false),
            confidence: String(r.confidence || 'high'),
            label: String(r.label || '文字區域'),
            source: 'auto_ocr' as const,
          };
        })
        .filter(Boolean);

      const usage = ocrResponse.usageMetadata;
      const tokens = {
        model: ocrModel,
        promptTokens: usage?.promptTokenCount || 0,
        candidateTokens: usage?.candidatesTokenCount || 0,
        totalTokens: usage?.totalTokenCount || 0,
      };

      res.json({
        regions: sanitizedRegions,
        tokens,
        rawCount: sanitizedRegions.length
      });
    } catch (error: any) {
      const errorMsg = error.message || '';
      if (errorMsg.includes('API_KEY_INVALID') || errorMsg.includes('API key not valid')) {
        return res.status(401).json({ error: 'API_KEY_INVALID' });
      }
      console.error('OCR API Error:', error);
      res.status(500).json({ error: errorMsg || 'OCR scanning error' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
