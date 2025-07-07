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
    const { app_key, app_secret, periodo } = req.body;
    
    if (!app_key || !app_secret || !periodo) {
      return res.status(400).json({ error: 'Credenciais e período obrigatórios' });
    }

    console.log(`🚀 Dashboard completo: ${periodo.inicio} - ${periodo.fim}`);
    const basePayload = { app_key, app_secret };

    async function callOmie(endpoint, call, param) {
      const response = await fetch(`https://app.omie.com.br/api/v1/${endpoint}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...basePayload, call, param })
      });

      if (!response.ok) {
        throw new Error(`OMIE ${endpoint}: ${response.status}`);
      }

      const data = await response.json();
      if (data.faultstring) {
        throw new Error(`OMIE ${endpoint}: ${data.faultstring}`);
      }
      return data;
    }

    const [dre, clientes, vendas] = await Promise.allSettled([
      callOmie('financas/dre', 'ListarDRE', [{
        dDataDe: periodo.inicio,
        dDataAte: periodo.fim,
        resumir_por: 'A'
      }]),
      callOmie('geral/clientes', 'ListarClientes', [{
        apenas_importado_api: 'N',
        pagina: 1,
        registros_por_pagina: 100
      }]),
      callOmie('produtos/pedido', 'ListarPedidos', [{
        dDataDe: periodo.inicio,
        dDataAte: periodo.fim,
        apenas_importado_api: 'N'
      }])
    ]);

    const results = {
      dre: dre.status === 'fulfilled' ? dre.value : { error: dre.reason?.message },
      clientes: clientes.status === 'fulfilled' ? clientes.value : { error: clientes.reason?.message },
      vendas: vendas.status === 'fulfilled' ? vendas.value : { error: vendas.reason?.message }
    };

    const metrics = {
      receitaTotal: 0, resultadoBruto: 0, ebitda: 0, resultadoLiquido: 0,
      totalClientes: 0, totalVendas: 0, ticketMedio: 0, margemLiquida: 0
    };

    if (results.dre && results.dre.dre_resumo) {
      results.dre.dre_resumo.forEach(item => {
        const valor = parseFloat(item.nValor || 0);
        switch (item.cCodigo) {
          case '3.01':
          case '3.01.001':
            metrics.receitaTotal += valor;
            break;
          case '3.05':
            metrics.resultadoBruto = valor;
            break;
          case '3.07':
            metrics.ebitda = valor;
            break;
          case '3.09':
          case '3.11':
            metrics.resultadoLiquido = valor;
            break;
        }
      });
    }

    if (results.clientes && results.clientes.clientes_cadastro) {
      metrics.totalClientes = results.clientes.clientes_cadastro.length;
    }

    if (results.vendas && results.vendas.pedido_venda_produto) {
      metrics.totalVendas = results.vendas.pedido_venda_produto.length;
      const totalVendasValor = results.vendas.pedido_venda_produto.reduce((sum, venda) => {
        return sum + parseFloat(venda.cabecalho?.nTotalPedido || 0);
      }, 0);
      metrics.ticketMedio = metrics.totalVendas > 0 ? totalVendasValor / metrics.totalVendas : 0;
    }

    if (metrics.receitaTotal > 0) {
      metrics.margemLiquida = (metrics.resultadoLiquido / metrics.receitaTotal) * 100;
    }

    const dashboard = {
      ...results, metrics, periodo,
      timestamp: new Date().toISOString(),
      fo
