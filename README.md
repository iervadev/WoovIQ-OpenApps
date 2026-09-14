# WoovIQ BodyScan — V3.5

Webapp statica per acquisizione antropometrica **frontale e laterale**, con MediaPipe Pose Landmarker e segmentazione locale della persona. La V3.5 sostituisce il vecchio timer “360°” con due acquisizioni guidate, ciascuna di almeno 8 campioni stabili. Non produce una mesh corporea 3D.

## Avvio

```sh
python3 -m http.server 8080
```

Aprire `http://localhost:8080`. Su iPhone (Safari) e Android (Chrome) usare un sito **HTTPS**, ad esempio GitHub Pages; l’indirizzo HTTP della rete locale non abilita la fotocamera sul telefono. Il primo caricamento del motore richiede Internet: JavaScript/WASM arrivano da jsDelivr e il modello da Google Storage. Non è garantito l’uso offline del modello.

## Procedura

1. Avviare la fotocamera e concedere il permesso. Usare preferibilmente la posteriore, lente 1×, telefono fermo e verticale.
2. Inserire l’altezza misurata con un metro (80–250 cm). In alternativa stampare `calibration-marker.svg` al 100%, verificare i 10 cm con un righello e toccare i bordi esterni opposti del marker tenuto sul piano del corpo. Un marker sullo schermo o a una distanza diversa dal corpo non fornisce una scala valida.
3. Inquadrare testa e piedi, con buona luce e abiti aderenti; tenere le braccia leggermente staccate dal busto.
4. Premere **Acquisisci vista frontale** e restare fermi. Il pulsante indica quale requisito manca se non è possibile partire.
5. Girarsi di 90° nello stesso punto e premere **Acquisisci vista laterale**. Una seconda vista frontale viene rifiutata. Dopo 20 secondi senza campioni sufficienti è possibile riprovare.
6. Leggere le stime di torace, vita e fianchi. Cambiando fotocamera o riferimento di scala si eliminano i campioni precedenti.

## Cosa è stato corretto

- feedback sul motivo che impedisce l’avvio; retry del motore AI;
- video completo con `object-fit: contain`, coordinate dei tocchi corrette e specchiatura coerente;
- un solo ciclo di acquisizione e annullamento della scansione al cambio fotocamera;
- segmentazione della persona anziché confronto dei colori con un pixel dello sfondo;
- uso immediato e rilascio delle maschere MediaPipe tramite callback;
- controlli su corpo completo, stabilità, distanza e distinzione delle viste;
- assenza di fallback che trasformavano campioni mancanti in circonferenze nulle;
- rimozione del peso e BMI derivati da una formula non validata;
- cache PWA aggiornata e limitata ai file dell’app.

## Limiti e validazione

Le circonferenze sono **stime sperimentali**: sezioni ellittiche ricavate dalla larghezza frontale e dalla profondità laterale. Le righe anatomiche sono euristiche, gli abiti e le braccia possono alterare la silhouette, la prospettiva introduce errore. Anche con un’altezza di riferimento corretta, non sono misure reali garantite né validate per uso clinico/metrologico. La rotazione non ricostruisce una superficie 3D e il peso non può essere determinato con questa procedura.

Le immagini della fotocamera vengono elaborate nel browser, senza upload né salvataggio di foto. I risultati restano in memoria fino al reset/ricaricamento.

## Test

Serve Node.js 22 o successivo; nessuna dipendenza npm:

```sh
node --test tests/*.test.mjs
node --input-type=module --check < app.js
```

`tests/engine-smoke.html`, servito via localhost/HTTPS, esegue inoltre un’inferenza reale su un’immagine pubblica MediaPipe e verifica posa, maschera e geometria, senza fotocamera. Richiede Internet.

Verificati: test automatici di geometria e stato; caricamento reale del motore nel browser desktop; layout a 390×844. Il browser a dimensioni mobili **non sostituisce** una prova su iPhone/Android fisici.

Prima di dichiarare compatibilità e accuratezza: completare più scansioni in Safari iOS e Chrome Android (frontale/posteriore, permesso negato, retry e cambio orientamento), annotare modello del dispositivo/versione browser e confrontare torace/vita/fianchi con misure manuali ripetute. Nessuna accuratezza numerica è attualmente validata.
