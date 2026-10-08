// 화면 채우기. 내용은 data/profile.json, data/projects.json 에만 있다.
// 잠긴 링크는 여기서 다루지 않는다(vault.js).
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const pad = (n) => String(n).padStart(2, "0");

async function load(path) {
  const r = await fetch(path, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}

function renderProfile(p) {
  // headline 만 <br> 을 쓴다. 나머지는 글자 그대로.
  for (const el of document.querySelectorAll("[data-bind]")) {
    const k = el.dataset.bind;
    if (k === "headline") el.innerHTML = esc(p[k]).replace(/&lt;br&gt;/g, "<br>");
    else el.textContent = p[k] ?? "";
  }

  $("#figure").innerHTML = p.photo
    ? `<img src="${esc(p.photo)}" alt="${esc(p.nameKr)}" fetchpriority="high" />`
    : `<span class="ph" aria-hidden="true">KJH</span>`;

  $("#meta").innerHTML = (p.meta || []).map((m) => `<div><dt>${esc(m.k)}</dt><dd>${esc(m.v)}</dd></div>`).join("");

  // 끊김 없이 돌게 같은 줄을 두 번 깐다. CSS 가 -50% 까지 민다.
  const words = (p.marquee || []).flatMap((w) => [`<span>${esc(w)}</span>`, `<span class="dot">✦</span>`]).join("");
  $("#marquee").innerHTML = words + words;

  timeline("#experience", "#expList", p.experience);
  timeline("#awards", "#awardList", p.awards);

  if (p.awardsPhoto && p.awards?.length) {
    const a = p.awardsPhoto;
    $("#awardPic").innerHTML = `<img src="${esc(a.src)}" alt="${esc(a.alt)}" loading="lazy" /><figcaption>${esc(a.cap)}</figcaption>`;
    $("#awardPic").hidden = false;
  }
  if (p.aboutPhoto) {
    $("#aboutPic").innerHTML = `<img src="${esc(p.aboutPhoto)}" alt="${esc(p.nameKr)}" loading="lazy" />`;
    $("#aboutPic").hidden = false;
  }

  if (p.tmi?.length) {
    $("#tmi").innerHTML = p.tmi.map((t) => `<div><dt>${esc(t.k)}</dt><dd>${esc(t.v)}</dd></div>`).join("");
    $("#tmi").hidden = false;
  }
  $("#contact").innerHTML = (p.contact || [])
    .map((c) => `<li><a href="${esc(c.href)}" target="_blank" rel="noopener"><b>${esc(c.k)}</b><span>${esc(c.v)}</span></a></li>`)
    .join("");
}

// 비어 있으면 섹션째 숨긴다. 채우면 저절로 나온다.
function timeline(sec, list, items) {
  if (!items?.length) return;
  $(list).innerHTML = items
    .map((e) => `<li data-rv><span class="when">${esc(e.when)}</span><div><h3 class="kr">${esc(e.title)}</h3>${e.desc ? `<p>${esc(e.desc)}</p>` : ""}</div></li>`)
    .join("");
  $(sec).hidden = false;
}

function renderProjects(list) {
  $("#cards").innerHTML = list
    .map(
      (p, i) => `
    <button class="card" type="button" data-id="${esc(p.id)}" data-status="${esc(p.status)}" data-rv>
      <div class="row"><span class="idx">${pad(i + 1)}</span><span class="kind">${esc(p.kind)}</span></div>
      <h3>${esc(p.title)}</h3>
      <p class="sub">${esc(p.sub)}</p>
      <p class="sum">${esc(p.summary)}</p>
      <div class="foot"><ul class="chips">${p.stack.map((s) => `<li>${esc(s)}</li>`).join("")}</ul><span class="more">자세히 →</span></div>
    </button>`,
    )
    .join("");

  $("#cards").addEventListener("click", (e) => {
    const card = e.target.closest(".card");
    if (card) openProject(list.find((p) => p.id === card.dataset.id));
  });
}

function openProject(p) {
  $("#modalBody").innerHTML = `
    <p class="m-kind">${esc(p.kind)} · ${esc(p.status)}</p>
    <h3 class="m-title">${esc(p.title)}</h3>
    <p class="m-sub">${esc(p.sub)}</p>
    <p class="m-h">Overview</p>
    <p class="m-p">${esc(p.summary)}</p>
    ${p.points.length ? `<p class="m-h">What I built</p><ul class="m-list">${p.points.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
    <p class="m-h">Stack</p>
    <ul class="chips">${p.stack.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
    <a class="m-go" href="#vault" data-close>🔒 주소는 Vault 에 있습니다</a>`;
  $("#modal").showModal();
}

function wireModal() {
  const m = $("#modal");
  m.addEventListener("click", (e) => {
    // 바깥(backdrop)을 눌러도 닫는다. dialog 자신이 눌린 건 바깥을 누른 것이다.
    if (e.target === m || e.target.closest("[data-close]")) m.close();
  });
}

// 보이는 섹션에만 번호를 매기고 레일을 만든다.
function numberSections() {
  const secs = [...document.querySelectorAll("section[data-label]")].filter((s) => !s.hidden);
  let n = 0;
  for (const s of secs) {
    const num = $(".sechead .num", s);
    if (num) num.textContent = pad(++n);
  }
  $("#rail").innerHTML = secs.map((s) => `<a href="#${s.id}" aria-label="${s.dataset.label}"><span>${s.dataset.label}</span></a>`).join("");

  const links = new Map([...$("#rail").children].map((a) => [a.hash.slice(1), a]));
  const io = new IntersectionObserver(
    (ents) => {
      for (const en of ents) {
        if (!en.isIntersecting) continue;
        for (const a of links.values()) a.classList.remove("on");
        links.get(en.target.id)?.classList.add("on");
      }
    },
    { rootMargin: "-45% 0px -50% 0px" },
  );
  secs.forEach((s) => io.observe(s));
}

function reveal() {
  for (const el of document.querySelectorAll(".sechead, .vault, .about")) el.setAttribute("data-rv", "");
  const io = new IntersectionObserver(
    (ents) => {
      for (const en of ents) {
        if (!en.isIntersecting) continue;
        en.target.classList.add("in");
        io.unobserve(en.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px" },
  );
  document.querySelectorAll("[data-rv]").forEach((el) => io.observe(el));
}

(async () => {
  wireModal();
  try {
    const [profile, projects] = await Promise.all([load("data/profile.json"), load("data/projects.json")]);
    renderProfile(profile);
    renderProjects(projects);
  } catch (e) {
    console.error(e);
    $("#cards").innerHTML = `<p class="kr">내용을 불러오지 못했습니다. 새로 고쳐 주세요.</p>`;
  }
  numberSections();
  reveal();
})();
