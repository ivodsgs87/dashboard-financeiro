const functions = require('firebase-functions');
const fetch = require('node-fetch');

// Função para processar fatura com Gemini
exports.processInvoice = functions.https.onCall(async (data, context) => {
  const { base64, mediaType } = data;
  
  if (!base64) {
    throw new functions.https.HttpsError('invalid-argument', 'Ficheiro não fornecido');
  }
  
  const GEMINI_API_KEY = functions.config().gemini?.apikey;
  
  if (!GEMINI_API_KEY) {
    throw new functions.https.HttpsError('failed-precondition', 'API key do Gemini não configurada');
  }
  
  try {
    const prompt = `Analisa esta fatura/recibo verde português e extrai os seguintes campos em JSON:
{
  "valorIliquido": número (valor base antes de IVA),
  "taxaIva": número (0, 6, 13 ou 23),
  "valorIva": número,
  "retencaoIRS": número (retenção na fonte, 0 se não houver ou não for visível),
  "temRetencao": boolean (true se o documento mostra retenção IRS, false se não),
  "totalDocumento": número,
  "totalPagar": número (valor final a receber após retenção),
  "pais": "PT" ou "UE" ou "Fora UE" (baseado no NIF/país do cliente),
  "nomeCliente": string,
  "descricao": string (descrição do serviço prestado),
  "data": string (formato YYYY-MM-DD),
  "nif": string (NIF do cliente, se visível)
}

IMPORTANTE: 
- Responde APENAS com o JSON, sem markdown nem explicações
- Se um campo não estiver visível, usa null
- Para país: se NIF começar com PT ou for 9 dígitos assume "PT", se tiver prefixo UE (ex: DE, FR, ES) assume "UE", senão "Fora UE"
- temRetencao: true se vês linha de "Retenção na fonte" ou "Retenção IRS" no documento
- Valores numéricos em euros, sem símbolo €`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                inline_data: {
                  mime_type: mediaType,
                  data: base64
                }
              },
              { text: prompt }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1000
          }
        })
      }
    );

    if (!response.ok) {
      const error = await response.json();
      console.error('Gemini API error:', error);
      throw new functions.https.HttpsError('internal', error.error?.message || 'Erro na API Gemini');
    }

    const result = await response.json();
    
    // Extrair texto da resposta
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Limpar e parsear JSON
    const cleanJson = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleanJson);
    
    return { success: true, data: parsed };
    
  } catch (error) {
    console.error('Erro ao processar fatura:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Erro ao processar fatura');
  }
});
