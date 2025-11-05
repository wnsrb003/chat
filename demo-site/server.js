const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 8080;

const mimeTypes = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".csv": "text/csv",
};

const server = http.createServer((req, res) => {
  console.log(`${req.method} ${req.url}`);

  // CORS 헤더 추가
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  let filePath = "." + req.url;
  if (filePath === "./") {
    filePath = "./index.html";
  }

  // broad_chat.csv 요청 처리
  if (req.url === "/broad_chat.csv") {
    // filePath = '../broad_chat.csv';
    filePath = "./서비스용어채팅.csv";
  }

  const extname = String(path.extname(filePath)).toLowerCase();
  const contentType = mimeTypes[extname] || "application/octet-stream";

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === "ENOENT") {
        res.writeHead(404, { "Content-Type": "text/html" });
        res.end("<h1>404 Not Found</h1>", "utf-8");
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${error.code}`, "utf-8");
      }
    } else {
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content, "utf-8");
    }
  });
});

server.listen(PORT, () => {
  console.log(`🌐 Demo site running at http://localhost:${PORT}/`);
  console.log(`📊 Using chat data from ../broad_chat.csv`);
  console.log(
    `\nMake sure the API Gateway is running at http://localhost:3000`
  );
});
