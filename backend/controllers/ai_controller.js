/**
 * ============================================================
 *  AI CONTROLLER — Google AI API Interface
 * ============================================================
 *  Exclusively responsible for:
 *    1. Formatting prompts from scanned form data + profile
 *    2. Executing HTTP POST to the Google AI API
 *    3. Parsing the structured JSON response
 * ============================================================
 */

import { handleError } from '../../util/errors/error_handler.js';

const GOOGLE_AI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Model priority list — tries each in order until one succeeds.
// gemma-4-26b is the primary model.
// gemma-3 models are used as high-efficiency fallbacks.
const MODELS = ['gemma-4-26b', 'gemma-3-4b', 'gemma-3-1b'];

const AIController = {
  _getPromptFields(scannedFields) {
    return (scannedFields || []).slice(0, 30);
  },

  _getPromptIndex(field, fallbackIndex) {
    return typeof field?.index === 'number' ? field.index : fallbackIndex;
  },

  _normalizeMappings(mappings, scannedFields) {
    if (!Array.isArray(mappings)) return [];

    const promptFields = this._getPromptFields(scannedFields);
    const promptIndices = promptFields.map((field, idx) => this._getPromptIndex(field, idx));
    const validIndices = new Set(promptIndices);

    return mappings
      .map((mapping) => {
        if (!mapping || typeof mapping !== 'object') return null;

        let normalizedIndex = mapping.index;
        if (
          !validIndices.has(normalizedIndex) &&
          Number.isInteger(normalizedIndex) &&
          normalizedIndex >= 0 &&
          normalizedIndex < promptFields.length
        ) {
          normalizedIndex = promptIndices[normalizedIndex];
        }

        if (!validIndices.has(normalizedIndex)) {
          return null;
        }

        return {
          index: normalizedIndex,
          value: mapping.value,
        };
      })
      .filter((mapping) => mapping && typeof mapping.value === 'string');
  },

  /**
   * Build the prompt that maps scanned form fields to profile data.
   * @param {Array}  scannedFields  — [ { id, name, type, label, placeholder, tagName, options? } ]
   * @param {Object} profileFields  — { "Full Name": "John Doe", "Email": "john@test.com", ... }
   * @param {string} profileName    — e.g. "Education"
   * @returns {string}
   */
  buildPrompt(scannedFields, profileFields, profileName) {
    // Utility to truncate long strings just in case
    const trunc = (str, len = 150) => (str && str.length > len ? str.substring(0, len) + '...' : str);

    // CRITICAL GUARANTEE: Never send the whole HTML. Send a maximum of 30 parsed input values only.
    const safeScannedFields = this._getPromptFields(scannedFields);

    const fieldDescriptions = safeScannedFields
      .map((f, i) => {
        const promptIndex = this._getPromptIndex(f, i);
        let desc = `[${promptIndex}] tag=<${f.tagName}> type="${f.type || ''}" name="${trunc(f.name) || ''}" id="${trunc(f.id, 50) || ''}" label="${trunc(f.label, 300) || ''}" placeholder="${trunc(f.placeholder) || ''}"`;
        if (f.domPath) {
          desc += `\n    DOM Path: ${trunc(f.domPath, 200)}`;
        }
        if (f.surroundingText) {
          desc += `\n    Context/Surrounding Text: "${trunc(f.surroundingText, 100)}"`;
        }
        if (f.options && f.options.length > 0) {
          // Keep max 20 options safely truncated
          const safeOptions = f.options.slice(0, 20).map((o) => `"${trunc(o.value, 50)}:${trunc(o.text, 50)}"`);
          desc += `\n    Options: [${safeOptions.join(', ')}]`;
        }
        return desc;
      })
      .join('\n');

    const profileData = Object.entries(profileFields)
      .map(([k, v]) => `  "${k}": "${v}"`)
      .join(',\n');

    return `You are a form autofill assistant. A user has a profile called "${profileName}" with the following data:

{
${profileData}
}

Below are the form fields detected on the current webpage:

${fieldDescriptions}

TASK:
Map each form field to the most appropriate profile value using intelligent matching. For modern React frameworks, explicit labels may be missing. You MUST heavily rely on the \`DOM Path\` hierarchy and \`Context/Surrounding Text\` structural fingerprints to correctly identify what each field represents.

RULES:
1. Return ONLY a valid JSON array.
2. Each element must be: { "index": <number>, "value": "<string>" }
3. "index" refers to the [N] number in the field list above.
4. For <select> fields, the "value" must be one of the option values listed.
5. If no profile data reasonably matches a field, OMIT that field from the output.
6. SECURITY/ACCURACY RULE: Do NOT map numeric IDs, account numbers, or bill numbers to common text fields like "City", "Name", or "Address" unless the profile key explicitly contains those words.
7. If in doubt, omit the field. It is better to leave it empty than to fill it with incorrect data.
8. Do NOT invent data that is not in the profile.
9. Do NOT include any explanation — ONLY the JSON array.

OUTPUT:`;
  },

  /**
   * Send the prompt to Google AI and parse the response.
   * Tries each model in the MODELS list; falls back on 404.
   * @param {string} apiKey
   * @param {string} prompt
   * @returns {Promise<{ success: boolean, mappings?: Array, error?: Object }>}
   */
  async callAI(apiKey, prompt) {
    const cleanApiKey = apiKey ? apiKey.trim() : '';

    // Guard: catch empty key BEFORE making the request
    if (!cleanApiKey || cleanApiKey.length < 20) {
      return {
        success: false,
        error: {
          category: 'AUTH_ERROR',
          severity: 'high',
          message: 'API key is missing or invalid. Please go to Settings and re-enter your Google AI API key.',
        },
      };
    }

    const payload = {
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
      },
    };

    let lastError = null;

    // Try each model in priority order
    for (const model of MODELS) {
      const url = `${GOOGLE_AI_BASE}/${model}:generateContent?key=${cleanApiKey}`;
      console.log(`[LazyFill] Trying Google AI model: ${model}`);

      let response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch (networkErr) {
        lastError = networkErr;
        console.warn(`[LazyFill] Network error with ${model}, trying next...`);
        continue;
      }

      // If model not found (404), try the next model
      if (response.status === 404) {
        console.warn(`[LazyFill] Model "${model}" returned 404, trying next...`);
        lastError = new Error(`Model ${model} not found (404)`);
        continue;
      }

      // Non-OK response (rate limit, auth error, etc.) — return immediately
      if (!response.ok) {
        let body = {};
        try {
          body = await response.json();
        } catch (_) {}
        return handleError(
          { statusCode: response.status, body },
          `ai_controller.callAI.response (${model})`
        );
      }

      // ---- SUCCESS: parse the response ----
      const data = await response.json();
      const textContent =
        data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

      try {
        const mappings = JSON.parse(textContent);
        if (!Array.isArray(mappings)) {
          throw new Error('Response is not an array.');
        }
        return { success: true, mappings };
      } catch (parseErr) {
        // Try to extract JSON from markdown code blocks
        const jsonMatch = textContent.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          try {
            const mappings = JSON.parse(jsonMatch[0]);
            return { success: true, mappings };
          } catch (_) {}
        }

        return handleError(
          { statusCode: 200, body: { error: { message: `Failed to parse AI response: ${textContent.slice(0, 300)}` } } },
          'ai_controller.callAI.parse'
        );
      }
    }

    // All models failed
    return handleError(
      lastError || new Error('All Google AI models failed.'),
      'ai_controller.callAI.allModelsFailed'
    );
  },

  /**
   * Main entry point: generate autofill mappings.
   * @param {string} apiKey
   * @param {Array}  scannedFields
   * @param {Object} profileFields
   * @param {string} profileName
   */
  async generateFill(apiKey, scannedFields, profileFields, profileName) {
    if (!apiKey) {
      return {
        success: false,
        error: { category: 'AUTH_ERROR', message: 'API key is not configured.' },
      };
    }

    if (!scannedFields || scannedFields.length === 0) {
      return {
        success: false,
        error: { category: 'VALIDATION_ERROR', message: 'No form fields detected on this page.' },
      };
    }

    if (!profileFields || Object.keys(profileFields).length === 0) {
      return {
        success: false,
        error: { category: 'VALIDATION_ERROR', message: 'Active profile has no data. Add fields to your profile first.' },
      };
    }

    const prompt = this.buildPrompt(scannedFields, profileFields, profileName);
    const aiResult = await this.callAI(apiKey, prompt);
    if (!aiResult.success || !aiResult.mappings) {
      return aiResult;
    }

    return {
      success: true,
      mappings: this._normalizeMappings(aiResult.mappings, scannedFields),
    };
  },
};

export default AIController;
