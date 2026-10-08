const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

// Mesmo modelo da leitura de faturas. Se a Google o descontinuar, muda aqui e em processInvoice.js.
const GEMINI_MODEL = "gemini-3.1-flash-lite";

if (!admin.apps.length) admin.initializeApp();

const INSTRUCOES = `És o assistente financeiro pessoal do dono desta app de orçamento. Respondes sempre em português de Portugal, de forma clara, curta e prática, para alguém que não é especialista.
Usa os números do RESUMO abaixo quando forem relevantes e diz de onde vêm ("segundo o resumo…"). Se o resumo não tiver a informação, diz que não a tens em vez de inventar.
Não és consultor financeiro nem fiscal: em decisões de impostos, crédito ou investimentos, explica as opções e os números e sugere confirmar com um profissional quando o valor em jogo for grande.
Não peças nem repitas dados pessoais (NIF, IBAN, moradas).`;

exports.chatFinancas = onRequest(
  { cors: true, timeoutSeconds: 60, memory: "256MiB" },
  async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    if (req.method === "OPTIONS") {
      res.set("Access-Control-Allow-Methods", "POST");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") { res.status(405).json({ error: { message: "Só POST" } }); return; }

    // Só quem tem sessão iniciada na app pode usar o chat (e, se CHAT_EMAILS estiver no .env, só esses emails)
    try {
      const token = String(req.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      if (!token) throw new Error("sem token");
      const quem = await admin.auth().verifyIdToken(token);
      const permitidos = String(process.env.CHAT_EMAILS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
      if (permitidos.length && !permitidos.includes(String(quem.email || "").toLowerCase())) {
        res.status(403).json({ error: { message: "Esta conta não tem acesso ao chat." } });
        return;
      }
    } catch (e) {
      res.status(401).json({ error: { message: "Sessão inválida. Volta a entrar na app." } });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) { res.status(500).json({ error: { message: "GEMINI_API_KEY não configurada no servidor." } }); return; }

    const { mensagens, contexto } = req.body || {};
    const lista = (Array.isArray(mensagens) ? mensagens : []).slice(-12)
      .filter(m => m && typeof m.texto === "string" && m.texto.trim())
      .map(m => ({ role: m.papel === "model" ? "model" : "user", parts: [{ text: m.texto.slice(0, 4000) }] }));
    if (!lista.length || lista[lista.length - 1].role !== "user") {
      res.status(400).json({ error: { message: "Falta a pergunta." } });
      return;
    }

    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: `${INSTRUCOES}\n\nRESUMO DAS FINANÇAS (gerado pela app):\n${String(contexto || "(sem resumo)").slice(0, 30000)}` }] },
            contents: lista,
            generationConfig: { temperature: 0.4, maxOutputTokens: 1500 },
          }),
        }
      );
      if (!r.ok) {
        const corpo = await r.text();
        console.error("Gemini chat error:", r.status, corpo.slice(0, 500));
        res.status(502).json({ error: { message: r.status === 429 ? "Limite gratuito do Gemini atingido. Tenta daqui a um bocado." : `Erro do Gemini (${r.status}).` } });
        return;
      }
      const dados = await r.json();
      const texto = (dados?.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("").trim();
      if (!texto) { res.status(502).json({ error: { message: "O Gemini não devolveu resposta." } }); return; }
      res.json({ resposta: texto });
    } catch (err) {
      console.error("chatFinancas error:", err);
      res.status(500).json({ error: { message: err.message || "Erro interno" } });
    }
  }
);
