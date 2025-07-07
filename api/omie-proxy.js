export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { endpoint, payload } = req.body;
    
    if (!endpoint || !payload) {
      return res.status(400).json({ error: 'endpoint e payload são obrigatórios' });
    }

    console.log(`🔄 Chamando OMIE: ${endpoint}`);
    
    const response = await fetch(`https://app.omie.com.br/api/v1/${endpoint}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Dashboard-Vercel/1.0'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`OMIE API Error: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.faultstring) {
      throw new Error(`OMIE Error: ${data.faultstring}`);
    }

    console.log(`✅ OMIE ${endpoint} - Sucesso`);
    return res.status(200).json(data);

  } catch (error) {
    console.error('❌ Erro no proxy:', error);
    return res.status(500).json({ error: error.message });
  }
}
