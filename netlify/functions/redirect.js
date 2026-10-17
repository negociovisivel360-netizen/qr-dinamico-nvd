const { getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
  const slug = (event.queryStringParameters && event.queryStringParameters.slug) || "";

  if (!slug) {
    return {
      statusCode: 400,
      body: "QR inválido: faltando identificador."
    };
  }

  try {
    const store = getStore("redirects");
    const data = await store.get(slug, { type: "json" });

    if (!data || !data.destino) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
        body: `<html><body style="font-family:sans-serif;text-align:center;padding:60px">
                 <h2>QR não configurado</h2>
                 <p>Este código ainda não tem um destino cadastrado.</p>
               </body></html>`
      };
    }

    // Atualiza contador e último acesso (não bloqueia o redirect se falhar)
    try {
      const cliques = (data.cliques || 0) + 1;
      await store.setJSON(slug, {
        ...data,
        cliques,
        ultimoAcesso: new Date().toISOString()
      });
    } catch (e) {
      // segue o redirect mesmo se o contador falhar
    }

    return {
      statusCode: 302,
      headers: { Location: data.destino }
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: "Erro ao processar o redirecionamento."
    };
  }
};
