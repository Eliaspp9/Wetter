/* Anmeldeseite der Wetter-App (kommt vom Server, solange kein gültiges Anmelde-Cookie da ist).
   1. Umzug von der alten Adresse: Einstellungen aus #umzug=… übernehmen (wie in index.html).
   2. Schon angemeldet (Token im Speicher, vor dem Cookie angemeldet): Token gegen Cookie tauschen und die App laden.
   3. Sonst: anmelden. Der Server setzt dabei das Cookie, die App bekommt das Token wie bisher. */
(function () {
  try {
    var mz = /^#umzug=([\w-]+)$/.exec(location.hash);
    if (mz) {
      var mo = JSON.parse(decodeURIComponent(escape(atob(mz[1].replace(/-/g, "+").replace(/_/g, "/")))));
      for (var mk in mo) if (/^wetter-/.test(mk) && typeof mo[mk] === "string" && localStorage.getItem(mk) == null) localStorage.setItem(mk, mo[mk]);
      history.replaceState(null, "", location.pathname + location.search);
    }
  } catch (e) {}
  function payload(t) { try { return JSON.parse(atob(String(t).split(".")[0].replace(/-/g, "+").replace(/_/g, "/"))); } catch (e) { return null; } }
  function stored() {
    var t = null; try { t = localStorage.getItem("wetter-token") || sessionStorage.getItem("wetter-token"); } catch (e) {}
    var p = t && payload(t); return p && p.exp > Date.now() ? t : null;
  }
  var f = document.getElementById("f"), wait = document.getElementById("wait"), err = document.getElementById("err"), b = document.getElementById("b");
  function form() { wait.hidden = true; f.hidden = false; try { document.getElementById("u").focus(); } catch (e) {} }
  function go() {
    var n = 0; try { n = +sessionStorage.getItem("wetter-lg") || 0; sessionStorage.setItem("wetter-lg", String(n + 1)); } catch (e) {}
    if (n > 2) { try { sessionStorage.removeItem("wetter-lg"); } catch (e) {} wait.textContent = "Die App lässt sich gerade nicht laden. Bitte später neu laden."; return; }
    location.replace("/" + location.search);
  }
  var t = stored();
  if (t) {
    fetch("/api/session", { method: "POST", headers: { Authorization: "Bearer " + t }, cache: "no-store" }).then(function (r) {
      if (r.ok) go();
      else { if (r.status === 401) { try { localStorage.removeItem("wetter-token"); sessionStorage.removeItem("wetter-token"); } catch (e) {} } form(); }
    }).catch(function () { wait.textContent = "Keine Verbindung. Prüfe die Internetverbindung und lade neu."; });
  } else form();
  var fails = 0;
  f.addEventListener("submit", function (e) {
    e.preventDefault(); err.textContent = ""; b.disabled = true;
    var u = document.getElementById("u").value.trim(), p = document.getElementById("p").value, keep = document.getElementById("k").checked;
    fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user: u, pass: p }), cache: "no-store" })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { r: r, j: j }; }); })
      .then(function (x) {
        if (x.r.ok && x.j.token && payload(x.j.token)) {
          try { (keep ? localStorage : sessionStorage).setItem("wetter-token", x.j.token); try { sessionStorage.removeItem("wetter-lg"); } catch (e) {} } catch (e2) {}
          go(); return;
        }
        fails++;
        err.textContent = x.r.status === 401 ? "Benutzername oder Passwort stimmt nicht." : x.r.status === 429 ? (x.j.error || "Zu viele falsche Anmeldungen. Bitte später noch einmal versuchen.") : "Der Anmeldeserver antwortet gerade nicht richtig.";
        setTimeout(function () { b.disabled = false; document.getElementById("p").value = ""; }, Math.min(6000, 500 * fails));
      })
      .catch(function () { err.textContent = "Keine Verbindung zum Anmeldeserver."; b.disabled = false; });
  });
})();
