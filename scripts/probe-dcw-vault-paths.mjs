import http from "node:http";

function post(path) {
  const data = JSON.stringify({ action: "deposit", amount: 1 });
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: 4000,
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          resolve({ path, status: res.statusCode, body: body.slice(0, 240) });
        });
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

const results = await Promise.all([
  post("/api/dcw/agents/vault"),
  post("/api/dcw/agents/vault/run"),
]);
for (const result of results) {
  console.log(JSON.stringify(result));
}
