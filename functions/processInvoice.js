const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

const geminiApiKey = defineSecret("GEMINI_API_KEY");

// Modelo atual (Julho 2026). Se este for descontinuado no futuro,
// consulta https://ai.google.dev/gemini-api/docs/models e atualiza.
const GEMINI_MODEL = "gemini-3.1-flash-lite";

exports.processInvoice = onRequest(
  {
    secrets: [geminiApiKey],
    cors: true,
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async (req, res) => {
    // CORS preflight
    if (req.method === "OPTIONS") {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Methods", "POST");
      res.set("Access-Control-Allow-Headers", "Content-Type");
      res.status(204).send("");
      return;
    }

    res.set("Access-Control-Allow-Origin", "*");

    try {
      const { base64, mediaType } = req.body?.data || {};

      if (!base64) {
        res.status(400).json({ error: { message: "Ficheiro em falta (base64)" } });
        return;
      }

      const prompt = `Analisa esta fatura/recibo e extrai os seguintes dados em JSON puro (sem markdown, sem backticks):
{
  "nomeCliente": "nome do cliente/empresa a quem foi emitida OU quem emitiu (o que fizer mais sentido como cliente do freelancer)",
  "descricao": "descrição breve do serviço",
  "valorIliquido": 0.00,
  "valorIva": 0.00,
  "taxaIva": 0,
  "retencaoIRS": 0.00,
  "temRetencao": false,
  "pais": "PT",
  "data": "YYYY-MM-DD"
}

Regras:
- valorIliquido: valor base sem IVA (número)
- valorIva: valor do IVA em euros (número, 0 se isento)
- taxaIva: percentagem do IVA (0, 6, 13 ou 23)
- retencaoIRS: valor da retenção na fonte em euros (número, 0 se não houver)
- temRetencao: true se houver retenção na fonte
- pais: "PT" se cliente português, "UE" se União Europeia, "Fora UE" caso contrário
- data: data de emissão do documento
- Responde APENAS com o JSON, nada mais.`;

      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiApiKey.value()}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  {
                    inline_data: {
                      mime_type: mediaType || "application/pdf",
                      data: base64,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: "application/json",
            },
          }),
        }
      );

      if (!geminiResponse.ok) {
        const errBody = await geminiResponse.text();
        console.error("Gemini API error:", geminiResponse.status, errBody);
        res.status(502).json({
          error: {
            message: `Erro Gemini (${geminiResponse.status}). Verifica se o modelo ${GEMINI_MODEL} ainda está disponível.`,
          },
        });
        return;
      }

      const result = await geminiResponse.json();
      const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        console.error("Resposta Gemini sem texto:", JSON.stringify(result).slice(0, 500));
        res.status(502).json({ error: { message: "Resposta vazia do Gemini" } });
        return;
      }

      // Parse do JSON (remove backticks se existirem)
      const clean = text.replace(/```json|```/g, "").trim();
      let data;
      try {
        data = JSON.parse(clean);
      } catch (e) {
        console.error("JSON parse falhou:", clean.slice(0, 300));
        res.status(502).json({ error: { message: "Gemini devolveu formato inválido" } });
        return;
      }

      res.json({ result: { success: true, data } });
    } catch (err) {
      console.error("processInvoice error:", err);
      res.status(500).json({ error: { message: err.message || "Erro interno" } });
    }
  }
);
