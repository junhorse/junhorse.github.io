// 잠긴 링크. vault.json 은 암호문뿐이고 주소는 이 브라우저 안에서만 풀린다.
// scripts/encrypt.mjs 와 같은 값(PBKDF2-SHA256 → AES-256-GCM)을 쓴다. 한쪽만 바꾸면 못 연다.
// 푼 열쇠는 sessionStorage 에만 둔다. 탭을 닫으면 다시 잠긴다.
//
// Face ID: 패스키의 PRF 확장을 쓴다. 생체 인증을 통과해야만 나오는 32바이트로 금고 열쇠를 감싸
// 이 기기 localStorage 에 둔다. 감싼 열쇠만으로는 못 연다. PRF 가 없는 브라우저에서는 단추를 숨긴다.
(() => {
  const KEY = "kjh.vault.key";
  const BIO = "kjh.vault.bio";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const rand = (n) => crypto.getRandomValues(new Uint8Array(n));

  const form = $("#lockForm"), input = $("#vaultPw"), go = $("#vaultGo"), err = $("#vaultErr");
  const bioOpen = $("#bioOpen"), bioAdd = $("#bioAdd"), bioDel = $("#bioDel"), bioMsg = $("#bioMsg");
  let box = null;
  let rawKey = null; // 열려 있는 동안의 금고 열쇠. Face ID 등록할 때 감싼다.

  async function getBox() {
    if (box) return box;
    const r = await fetch("vault.json", { cache: "no-cache" });
    if (!r.ok) throw new Error("empty");
    return (box = await r.json());
  }

  async function derive(pw, v) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt: unb64(v.salt), iterations: v.iter },
      base,
      { name: "AES-GCM", length: 256 },
      true,
      ["decrypt"],
    );
  }

  // 틀린 열쇠면 GCM 검사에서 걸려 던진다.
  async function openWith(raw) {
    const v = await getBox();
    const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(v.iv) }, key, unb64(v.ct));
    return JSON.parse(new TextDecoder().decode(plain));
  }

  function show(data, raw) {
    rawKey = raw;
    sessionStorage.setItem(KEY, b64(raw));
    $("#vaultLinks").innerHTML = data.links
      .map((l, i) => {
        const host = l.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
        return `<a class="link" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" style="--i:${i}">
          <span class="tag">${esc(l.tag)}</span>
          <h3>${esc(l.title)}</h3>
          ${l.desc ? `<p>${esc(l.desc)}</p>` : ""}
          ${l.note ? `<p class="note">${esc(l.note)}</p>` : ""}
          <span class="host">${esc(host)}</span>
        </a>`;
      })
      .join("");
    form.hidden = true;
    $("#vaultOpen").hidden = false;
    bioMsg.textContent = "";
    syncBio();
  }

  function lock() {
    rawKey = null;
    sessionStorage.removeItem(KEY);
    $("#vaultLinks").innerHTML = "";
    $("#vaultOpen").hidden = true;
    form.hidden = false;
    input.value = "";
    err.textContent = "";
    syncBio();
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.textContent = "";
    go.disabled = true;
    form.classList.add("busy");
    try {
      const v = await getBox();
      const raw = new Uint8Array(await crypto.subtle.exportKey("raw", await derive(input.value, v)));
      show(await openWith(raw), raw);
    } catch (x) {
      err.textContent = x.message === "empty" ? "아직 잠근 링크가 없습니다." : "비밀번호가 맞지 않습니다.";
      input.select();
    } finally {
      go.disabled = false;
      form.classList.remove("busy");
    }
  });

  $("#vaultLock").addEventListener("click", lock);

  // ── Face ID ──────────────────────────────────────────

  let bioOk = false;
  const saved = () => {
    try { return JSON.parse(localStorage.getItem(BIO) || "null"); } catch { return null; }
  };

  function syncBio() {
    const s = saved();
    bioOpen.hidden = !(bioOk && s);
    bioAdd.hidden = !(bioOk && !s);
    bioDel.hidden = !s;
  }

  // PRF 결과(32바이트)를 그대로 감싸는 열쇠로 쓴다.
  const wrapKey = (prf) => crypto.subtle.importKey("raw", prf, "AES-GCM", false, ["encrypt", "decrypt"]);

  async function prfOf(credId, salt) {
    const cred = await navigator.credentials.get({
      publicKey: {
        challenge: rand(32),
        allowCredentials: [{ type: "public-key", id: credId }],
        userVerification: "required",
        extensions: { prf: { eval: { first: salt } } },
      },
    });
    const first = cred.getClientExtensionResults().prf?.results?.first;
    if (!first) throw new Error("noprf");
    return first;
  }

  bioAdd.addEventListener("click", async () => {
    if (!rawKey) return;
    bioMsg.className = "err kr";
    bioMsg.textContent = "";
    bioAdd.disabled = true;
    try {
      const salt = rand(32);
      const cred = await navigator.credentials.create({
        publicKey: {
          rp: { name: "KIMJUNHO Vault" },
          user: { id: rand(16), name: "vault", displayName: "KIMJUNHO Vault" },
          challenge: rand(32),
          pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
          authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "required", userVerification: "required" },
          extensions: { prf: { eval: { first: salt } } },
        },
      });
      const ext = cred.getClientExtensionResults().prf;
      if (!ext?.enabled && !ext?.results) throw new Error("noprf");
      // 만들 때 결과를 안 주는 기기가 있다. 그러면 한 번 더 인증해서 받는다.
      const prf = ext.results?.first || (await prfOf(cred.rawId, salt));
      const iv = rand(12);
      const wrapped = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await wrapKey(prf), rawKey);
      localStorage.setItem(BIO, JSON.stringify({ id: b64(cred.rawId), salt: b64(salt), iv: b64(iv), wrapped: b64(wrapped) }));
      bioMsg.className = "err kr ok";
      bioMsg.textContent = "등록했습니다. 다음부터 이 기기에서는 Face ID로 열 수 있습니다.";
    } catch (x) {
      bioMsg.textContent =
        x.message === "noprf"
          ? "이 브라우저는 Face ID로 금고 열기를 지원하지 않습니다. iOS 18 이상의 Safari나 최신 Chrome에서 해 주세요."
          : "등록하지 못했습니다. 다시 해 주세요.";
    } finally {
      bioAdd.disabled = false;
      syncBio();
    }
  });

  bioOpen.addEventListener("click", async () => {
    const s = saved();
    if (!s) return;
    err.textContent = "";
    bioOpen.disabled = true;
    try {
      const prf = await prfOf(unb64(s.id), unb64(s.salt));
      let raw;
      try {
        raw = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(s.iv) }, await wrapKey(prf), unb64(s.wrapped)));
        show(await openWith(raw), raw);
      } catch {
        // 금고를 새 비밀번호로 다시 잠갔으면 예전 열쇠가 안 맞는다.
        localStorage.removeItem(BIO);
        err.textContent = "금고가 바뀌었습니다. 비밀번호로 연 다음 Face ID를 다시 등록해 주세요.";
      }
    } catch {
      err.textContent = "Face ID 인증이 취소됐습니다. 다시 누르시거나 비밀번호를 입력해 주세요.";
    } finally {
      bioOpen.disabled = false;
      syncBio();
    }
  });

  bioDel.addEventListener("click", () => {
    localStorage.removeItem(BIO);
    bioMsg.className = "err kr";
    bioMsg.textContent = "이 기기의 Face ID 등록을 지웠습니다. 기기 암호 설정에 남은 패스키도 지우시면 됩니다.";
    syncBio();
  });

  (async () => {
    bioOk = !!(window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.().catch(() => false)));
    syncBio();

    // 같은 탭에서 새로 고친 경우. 금고가 바뀌어 안 맞으면 조용히 잠근다.
    const k = sessionStorage.getItem(KEY);
    if (!k) return;
    try {
      const raw = unb64(k);
      show(await openWith(raw), raw);
    } catch {
      sessionStorage.removeItem(KEY);
    }
  })();
})();
