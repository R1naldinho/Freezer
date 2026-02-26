const express = require("express");
const cron = require("node-cron");
const webpush = require("web-push");
const { createClient } = require("@supabase/supabase-js");
//require("dotenv").config({ path: "dot.env" });
const path = require("path");

const app = express();
const port = 3000;
app.use(express.json());
app.use(express.static("public"));

// --- CONFIGURAZIONE SUPABASE ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// --- CONFIGURAZIONE WEB-PUSH (VAPID) ---
const mail = process.env.VAPID_MAIL;
const publicVapidKey = process.env.PUBLIC_VAPID_KEY;
const privateVapidKey = process.env.PRIVATE_VAPID_KEY;

webpush.setVapidDetails(mail, publicVapidKey, privateVapidKey);

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});


// --- AUTOMAZIONE CRON (Ore 17:00 ogni giorno) ---
cron.schedule(
    "0 19 * * *",
    async() => {
        console.log("Controllo scadenze delle ore 19:00...");

        const dataTarget = new Date();
        dataTarget.setDate(dataTarget.getDate() + 7);
        const dataString = dataTarget.toISOString().split("T")[0];

        try {
            const { data: prodotti, error: prodError } = await supabase
                .from("products")
                .select("product_id, id")
                .lte("expiry_date", dataString)
                .order("name", { ascending: true })
                .order("expiry_date", { ascending: true });

            if (prodError) throw prodError;
            console.log(`Prodotti in scadenza il ${dataString}:`, prodotti);

            if (prodotti && prodotti.length > 0) {

                const { data: subs, error: subError } = await supabase
                    .from("push_subscriptions")
                    .select("subscription_json");

                if (subError) throw subError;

                if (subs && subs.length > 0) {
                    const payload = JSON.stringify({
                        title: "Scadenza Freezer! ❄️",
                        body: `Tra 7 giorni scadono: ${prodotti.map((p) => {
                            return p.name || p.product_id;
                        }).join(", ")}`,
                    });

                    subs.forEach((s) => {
                        webpush
                            .sendNotification(s.subscription_json, payload)
                            .catch((err) => console.error("Errore invio push:", err));
                    });
                    console.log(`Notifica inviata per ${prodotti.length} prodotti.`);
                }
            }
        } catch (err) {
            console.error("Errore nel Cron Job:", err);
        }
    }, {
        timezone: "Europe/Rome",
    },
);

// --- API ENDPOINTS ---

// Salva sottoscrizione push dal browser
app.post("/api/subscribe", async(req, res) => {
    const subscription = req.body;
    try {
        const { error } = await supabase
            .from("push_subscriptions")
            .insert([{ subscription_json: subscription }]);
        if (error) throw error;
        res.status(201).json({ message: "Dispositivo registrato!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Categorie ordinate
app.get("/api/getCategories", async(req, res) => {
    try {
        const { data, error } = await supabase
            .from("categories")
            .select("*")
            .order("order", { ascending: true });
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Tutti i prodotti con dati categoria (ordinati via JS)
app.get("/api/getProducts", async(req, res) => {
    try {
        const { data, error } = await supabase
            .from("productsAndCategories")
            .select("*, categories(name, icon, order)");
        if (error) throw error;
        if (data) {
            data.sort((a, b) => {
                if (a.categories.order !== b.categories.order) {
                    return a.categories.order - b.categories.order;
                }
                return a.name.localeCompare(b.name);
            });
            res.json(data);
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Prodotti per categoria
app.get("/api/getProductsByCategory/:category_id", async(req, res) => {
    try {
        const { data, error } = await supabase
            .from("productsAndCategories")
            .select("*")
            .eq("category_id", req.params.category_id)
            .order("name", { ascending: true });
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/api/getExpiringProducts", async(req, res) => {
    try {
        const { data, error } = await supabase
            .from("products")
            .select("*")
            .order("name", { ascending: true })
            .order("expiry_date", { ascending: true });
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Prodotti che scadono entro N giorni
app.get("/api/getExpiringProducts/:days", async(req, res) => {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + parseInt(req.params.days));
    try {
        const { data, error } = await supabase
            .from("products")
            .select("*")
            .lte("expiry_date", targetDate.toISOString().split("T")[0])
            .order("name", { ascending: true })
            .order("expiry_date", { ascending: true });
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Aggiungi prodotto
app.post("/api/addProduct", async(req, res) => {
    const { product_id, expiry_date } = req.body;
    try {
        const { data, error } = await supabase
            .from("products")
            .insert([{ product_id, expiry_date }])
            .select();
        if (error) throw error;
        res.json(data[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Elimina prodotto
app.delete("/api/deleteProduct/:id", async(req, res) => {
    try {
        const { data, error } = await supabase
            .from("products")
            .delete()
            .eq("id", req.params.id)
            .select();
        if (error) throw error;
        res.json(data[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, "0.0.0.0", () => {
    console.log(`Server freezer attivo sulla porta ${port}`);
});
