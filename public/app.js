const PUBLIC_VAPID_KEY =
    "BABbQ9_8Qlk1utQGiOmD_Q2AssTruNpO6L0m7ZaVKZPTx_XF2gq2e-PanZd5F0gICPW75fX_MeVzUq1ogL3umZA";

let allPossibleProducts = [];
let categories = [];

document.addEventListener("DOMContentLoaded", async() => {
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker
            .register("/sw.js")
            .then(() => console.log("SW registrato"))
            .catch((err) => console.error("Errore SW:", err));
    }

    await checkSubscription();
    await initApp();
});

async function initApp() {
    try {
        const resCat = await fetch("/api/getCategories");
        categories = await resCat.json();

        const resAllProd = await fetch("/api/getProducts");
        allPossibleProducts = await resAllProd.json();

        const resReal = await fetch("/api/getExpiringProducts");
        const myFreezer = await resReal.json();

        populateForm();
        renderUI(myFreezer);
    } catch (err) {
        console.error("Errore inizializzazione:", err);
    }
}

function populateForm() {
    const catSelect = document.getElementById("form-category");
    catSelect.innerHTML = '<option value="">Seleziona Categoria</option>';
    categories.forEach((c) => {
        catSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`;
    });
}

function handleCategoryChange() {
    const categoryId = document.getElementById("form-category").value;
    const prodSelect = document.getElementById("form-name-select");

    if (!categoryId) {
        prodSelect.innerHTML =
            '<option value="">Scegli prima la categoria</option>';
        return;
    }

    const filtered = allPossibleProducts.filter(
        (p) => p.category_id == categoryId,
    );
    prodSelect.innerHTML = '<option value="">Seleziona Prodotto</option>';
    filtered.forEach((p) => {
        prodSelect.innerHTML += `<option value="${p.product_id}">${p.name}</option>`;
    });
}

async function renderUI(realProducts) {
    console.log("Dati reali:", realProducts);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const alertSection = document.getElementById("alerts-section");

    const alertRes = await fetch("/api/getExpiringProducts/7");
    const alerts = await alertRes.json();
    console.log("Prodotti in scadenza entro 7 giorni:", alerts);

    if (alerts.length > 0) {
        alertSection.innerHTML = "<h2>⚠️ In Scadenza</h2>";
        alerts.forEach((p) => {
            const diff = (new Date(p.expiry_date) - today) / (1000 * 3600 * 24);
            const colorClass = diff <= 2 ? "expiry-critical" : "expiry-soon";
            const displayName = (() => {
                const info = allPossibleProducts.find(
                    (item) => item.product_id === p.product_id,
                );

                return info ? info.name : "Sconosciuto";
            })();
            alertSection.innerHTML += renderRow(p, colorClass, displayName);
        });
    } else {
        alertSection.innerHTML = "";
    }

    const accordion = document.getElementById("categories-accordion");
    accordion.innerHTML = "<h2>Inventario</h2>";

    const inventory = realProducts.filter((p) => {
        if (!p.expiry_date) return true;
        const diff = (new Date(p.expiry_date) - today) / (1000 * 3600 * 24);
        return diff > 7;
    });

    console.log("Inventario (scadenza > 7 giorni):", inventory);

    categories.forEach((cat) => {
        const catProducts = inventory
            .filter((p) => {
                const infoProdotto = allPossibleProducts.find(
                    (item) => item.product_id === p.product_id,
                );
                return infoProdotto && infoProdotto.category_id === cat.id;
            })
            .sort((a, b) => {
                if (a.expiry_date && b.expiry_date) {
                    const dateDiff = new Date(a.expiry_date) - new Date(b.expiry_date);
                    if (dateDiff !== 0) return dateDiff;
                }
                const prodottoA = allPossibleProducts.find(
                    (i) => i.id === a.product_id,
                );
                const prodottoB = allPossibleProducts.find(
                    (i) => i.id === b.product_id,
                );
                const nameA = prodottoA ? prodottoA.name : "";
                const nameB = prodottoB ? prodottoB.name : "";

                return nameA.localeCompare(nameB);
            });

        console.log(`Prodotti per categoria "${cat.name}":`, catProducts);

        if (catProducts.length > 0) {
            const item = document.createElement("div");
            item.className = "accordion-item";

            item.innerHTML = `
            <div class="accordion-header" onclick="toggleAccordion('cat-${cat.id}')">
                <span class="header-content">
                    <span class="icon-wrapper">${cat.icon}</span>
                    <span class="cat-name">${cat.name}</span>
                    <span class="cat-count">(${catProducts.length})</span>
                </span>
                <i class="fa-solid fa-chevron-down"></i>
            </div>
            <div id="cat-${cat.id}" class="accordion-content" style="display:none;">
                ${catProducts
                  .map((p) => {
                    const info = allPossibleProducts.find(
                      (item) => item.product_id === p.product_id,
                    );
                    console.log("Info prodotto per rendering:", info.name);
                    return renderRow(p, "", info ? info.name : "Sconosciuto");
                  })
                  .join("")}
            </div>
        `;
            accordion.appendChild(item);
        }
    });
}

function renderRow(p, extraClass = "", displayName = "") {
    console.log("Rendering prodotto:", p);
    const d = p.expiry_date ?
        new Date(p.expiry_date).toLocaleDateString("it-IT") :
        "";
    return `
        <div class="card ${extraClass}">
            <div>
                <strong>${displayName}</strong><br>
                ${d ? `<small>Scade: ${d}</small>` : ""}
            </div>
            <button onclick="deleteProduct('${p.id}')" class="btn-delete">🗑️</button>
        </div>
    `;
}

async function saveProduct() {
  const data = {
    product_id: document.getElementById("form-name-select").value,
    expiry_date: document.getElementById("form-expiry").value || null,
    name: allPossibleProducts.find(p => p.product_id === document.getElementById("form-name-select").value)?.name || "Sconosciuto"
  };

  if (
    !data.product_id ||
    (document.getElementById("form-expiry").required && !data.expiry_date)
  ) {
    alert("Inserisci tutti i dati!");
    return;
  }

  const res = await fetch("/api/addProduct", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (res.ok) {
    closeModal();
    initApp();
  }
}

async function deleteProduct(id) {
  console.log("Eliminazione prodotto con ID:", id);
  if (confirm("Prodotto consumato?")) {
    await fetch(`/api/deleteProduct/${id}`, { method: "DELETE" });
    initApp();
  }
}

function toggleAccordion(id) {
  const content = document.getElementById(id);
  const isVisible = content.style.display === "block";
  document
    .querySelectorAll(".accordion-content")
    .forEach((el) => (el.style.display = "none"));
  content.style.display = isVisible ? "none" : "block";
}

function openModal() {
  document.getElementById("modal").style.display = "block";
}

function closeModal() {
  document.getElementById("modal").style.display = "none";
  document.getElementById("add-product-form").reset();
  document.getElementById("form-category").value = '<option value="">Seleziona Categoria</option>';
  document.getElementById("form-name-select").innerHTML = '<option value="">Scegli prima la categoria</option>';
}

async function checkSubscription() {
  if (!("serviceWorker" in navigator)) return;
  const register = await navigator.serviceWorker.ready;
  const subscription = await register.pushManager.getSubscription();
  const pushBtn = document.getElementById("push-btn");
  if (pushBtn) pushBtn.style.display = subscription ? "none" : "inline-block";
}

async function subscribeUser() {
  try {
    const register = await navigator.serviceWorker.ready;
    const subscription = await register.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY),
    });

    await fetch("/api/subscribe", {
      method: "POST",
      body: JSON.stringify(subscription),
      headers: { "Content-Type": "application/json" },
    });

    alert("Notifiche attivate!");
    checkSubscription();
  } catch (err) {
    console.error("Errore iscrizione:", err);
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

if (document.getElementById("push-btn")) {
  document.getElementById("push-btn").addEventListener("click", subscribeUser);
}
