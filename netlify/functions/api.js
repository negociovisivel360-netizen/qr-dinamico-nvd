const { getStore } = require("@netlify/blobs");

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "NVD2026";

function checkAuth(event) {
  const senha = event.headers["x-admin-password"] || event.headers["X-Admin-Password"];
  return senha === ADMIN_PASSWORD;
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, x-admin-password",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS"
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return json(200, {});
  }

  if (!checkAuth(event)) {
    return json(401, { erro: "Senha inválida" });
  }

  const store = getStore({
    name: "redirects",
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_API_TOKEN
  });
  const path = event.path.replace(/^\/api\/?/, "").replace(/^\/\.netlify\/functions\/api\/?/, "");
  const slugFromPath = path || (event.queryStringParameters && event.queryStringParameters.slug);

  try {
    if (event.httpMethod === "GET") {
      const { blobs } = await store.list();
      const items = [];
      for (const blob of blobs) {
        const data = await store.get(blob.key, { type: "json" });
        items.push({ slug: blob.key, ...data });
      }
      items.sort((a, b) => (a.slug || "").localeCompare(b.slug || "", undefined, { numeric: true }));
      return json(200, items);
    }

    // Gera um lote de QRs "virgens" (sem destino), pra imprimir antes de sair pra prospecção
    if (event.httpMethod === "POST" && slugFromPath === "lote") {
      const body = JSON.parse(event.body || "{}");
      const quantidade = Math.min(Math.max(parseInt(body.quantidade) || 0, 1), 200);
      const prefixo = (body.prefixo || "nvd").toLowerCase().replace(/[^a-z0-9-]/g, "");

      const { blobs } = await store.list();
      const numeros = blobs
        .map(b => {
          const m = b.key.match(new RegExp(`^${prefixo}-(\\d+)$`));
          return m ? parseInt(m[1]) : 0;
        });
      let proximo = (numeros.length ? Math.max(...numeros) : 0) + 1;

      const criados = [];
      for (let i = 0; i < quantidade; i++) {
        const numero = String(proximo + i).padStart(3, "0");
        const slug = `${prefixo}-${numero}`;
        await store.setJSON(slug, {
          nome: "",
          destino: "",
          cliques: 0,
          criadoEm: new Date().toISOString()
        });
        criados.push(slug);
      }
      return json(201, { ok: true, criados });
    }

    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const { slug, nome, destino } = body;
      if (!slug || !destino) {
        return json(400, { erro: "slug e destino são obrigatórios" });
      }
      const existing = await store.get(slug, { type: "json" });
      if (existing) {
        return json(409, { erro: "Já existe um QR com esse identificador" });
      }
      await store.setJSON(slug, {
        nome: nome || slug,
        destino,
        cliques: 0,
        criadoEm: new Date().toISOString()
      });
      return json(201, { ok: true, slug });
    }

    if (event.httpMethod === "PUT") {
      if (!slugFromPath) return json(400, { erro: "slug ausente" });
      const body = JSON.parse(event.body || "{}");
      const existing = await store.get(slugFromPath, { type: "json" });
      if (!existing) return json(404, { erro: "QR não encontrado" });
      await store.setJSON(slugFromPath, {
        ...existing,
        nome: body.nome !== undefined ? body.nome : existing.nome,
        destino: body.destino !== undefined ? body.destino : existing.destino
      });
      return json(200, { ok: true });
    }

    if (event.httpMethod === "DELETE") {
      if (!slugFromPath) return json(400, { erro: "slug ausente" });
      await store.delete(slugFromPath);
      return json(200, { ok: true });
    }

    return json(405, { erro: "Método não suportado" });
  } catch (err) {
    return json(500, { erro: "Erro interno", detalhe: String(err) });
  }
};
