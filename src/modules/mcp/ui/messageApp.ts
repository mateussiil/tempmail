/**
 * MCP App que mostra um email formatado no chat (clientes que suportam MCP
 * Apps; os demais ignoram e usam o texto). O HTML do email é de terceiros: vai
 * num iframe aninhado com `sandbox` vazio (sem scripts, sem acesso ao app) e CSP
 * que só deixa carregar imagens e estilos.
 */
export const MESSAGE_APP_URI = "ui://tempmail/message.html";
export const MCP_APP_MIME = "text/html;profile=mcp-app";

export const MESSAGE_APP_HTML = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{color-scheme:light dark;font-family:system-ui,sans-serif}
body{margin:0;padding:12px;font-size:14px}
.head{margin-bottom:8px}.subject{font-weight:600;font-size:16px;margin:0 0 2px}
.meta{opacity:.7;font-size:12px;overflow-wrap:anywhere}
.code{display:flex;gap:8px;align-items:center;margin:8px 0;padding:8px 10px;border:1px solid #8884;border-radius:8px}
.code b{font:600 18px ui-monospace,monospace;letter-spacing:.08em}
iframe{width:100%;border:1px solid #8884;border-radius:8px;background:#fff;min-height:200px;height:420px}
pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:0}
a{color:inherit}.note{opacity:.7;font-size:12px;margin-top:8px}
</style></head><body><div id="root">Carregando o email…</div>
<script>
(function(){
  var nextId=1;
  function send(msg){window.parent.postMessage(Object.assign({jsonrpc:"2.0"},msg),"*")}
  function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
  function doc(html){
    return '<!doctype html><html><head><meta charset="utf-8">'
      +'<meta http-equiv="Content-Security-Policy" content="default-src \\'none\\'; img-src https: http: data:; style-src \\'unsafe-inline\\' https:; font-src https: data:">'
      +'<base target="_blank"><style>body{margin:12px;font-family:system-ui,sans-serif;color:#15181d;background:#fff;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style>'
      +'</head><body>'+html+'</body></html>';
  }
  function render(data){
    var m=data&&data.message; var root=document.getElementById("root");
    if(!m){root.textContent="Não foi possível mostrar o email.";return}
    var h='<div class="head"><p class="subject">'+esc(m.subject||"(sem assunto)")+'</p><div class="meta">'+esc(m.from)+' · '+esc(m.receivedAt)+'</div></div>';
    if(m.verificationCode)h+='<div class="code">Código <b>'+esc(m.verificationCode)+'</b></div>';
    root.innerHTML=h;
    if(m.html){
      var f=document.createElement("iframe");f.setAttribute("sandbox","");f.srcdoc=doc(m.html);root.appendChild(f);
    }else{
      var p=document.createElement("pre");p.textContent=m.text||"(sem conteúdo)";root.appendChild(p);
    }
    if(data.webUrl){var n=document.createElement("div");n.className="note";
      n.innerHTML='<a href="'+esc(data.webUrl)+'" target="_blank" rel="noopener">Abrir no tempmail</a>';root.appendChild(n)}
    send({method:"ui/notifications/size-changed",params:{height:document.documentElement.scrollHeight}});
  }
  window.addEventListener("message",function(e){
    var msg=e.data; if(!msg||msg.jsonrpc!=="2.0")return;
    if(msg.method==="ui/notifications/tool-result"){
      var r=msg.params||{}; render(r.structuredContent||{});
    }
  });
  send({id:nextId++,method:"ui/initialize",params:{protocolVersion:"2026-01-26",appInfo:{name:"tempmail-message",version:"1.0.0"},appCapabilities:{}}});
  send({method:"ui/notifications/initialized",params:{}});
})();
</script></body></html>`;
