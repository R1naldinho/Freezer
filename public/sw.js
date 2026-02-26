self.addEventListener('push', e => {
    const data = e.data.json();
    console.log('Push ricevuto...');
    console.log('Dati della notifica:', data);
    const prodotti = data.body.match(/Tra 7 giorni scadono: (.+)/)[1].split(", ").map(id => parseInt(id));

    self.registration.showNotification(data.title, {
        body: data.body,
        icon: 'https://cdn-icons-png.flaticon.com/512/561/561169.png', // Un'icona a tua scelta
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: '2'
        },
    });
});

self.addEventListener('notificationclick', e => {
    e.notification.close();
    e.waitUntil(clients.openWindow("/"));
});