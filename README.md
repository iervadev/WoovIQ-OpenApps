# WoovIQ BodyScan V4.2.1 — scansione 360° sul web

Scansione guidata con telefono fermo e persona che ruota sul posto. La fotocamera acquisisce otto silhouette, da cui viene ricostruita una **superficie 3D approssimata**. L’altezza è ricavata dalla silhouette dopo la calibrazione con un riferimento stampato: non viene chiesto di inserire l’altezza.

## Uso su telefono

1. Aprire il sito HTTPS in Safari su iPhone o Chrome su Android. Consentire la fotocamera e attendere `AI: pronta`. Usare la posteriore a 1×, senza zoom digitale, fissando il telefono verticale.
2. Stampare `calibration-marker.svg` al 100%, senza adattamento alla pagina. Verificare con un righello che i bordi esterni misurino **10 × 10 cm**.
3. Mettere il marker accanto alla persona, sullo stesso piano/distanza dalla fotocamera, rivolto all’obiettivo. Non usare il marker visualizzato su uno schermo. Premere **Calibra 10 cm** e toccare il bordo esterno superiore e quello inferiore. La calibrazione è manuale; il successivo rilevamento dell’altezza è automatico.
4. Inquadrare tutta la persona, testa, mani e piedi inclusi, con abiti aderenti, luce uniforme, gambe dritte e braccia basse distanziate dal busto di circa 30°. Il marker non deve coprire la persona.
5. Premere **Avvia scansione 360°**. Restare fermi per la prima vista, poi ruotare nello stesso verso a intervalli di circa 45°, fermandosi brevemente quando richiesto. Il sistema accetta entrambi i versi e raccoglie quattro campioni stabili per vista.
6. Acquisire 0°, 45°, 90°, 135°, 180°, 225°, 270° e 315°, poi tornare alla posa iniziale per verificare il giro completo. La guida vocale può essere disattivata. Se l’orientamento non è riconosciuto, seguire il messaggio e fermarsi; non muovere telefono, zoom o posizione della persona.
7. Al termine, trascinare il modello per ruotarlo, usare lo zoom ed esportare **OBJ in centimetri** o le misure in **JSON**. Sono disponibili altezza, torace, vita e fianchi. Non vengono inventati peso o BMI dalle immagini.

È possibile annullare in qualsiasi momento. Giro incompleto, spostamenti rilevati, posa instabile o silhouette incoerenti non producono risultati validi. Il limite di una scansione è tre minuti; un cambio fotocamera/orientamento richiede una nuova calibrazione.

## Guida vocale

La guida parte automaticamente quando si preme **Avvia fotocamera** e accompagna la scansione. Non serve un pulsante di prova. I messaggi italiani sono file AAC inclusi nel sito, riprodotti tramite un unico elemento audio: non dipendono dalle voci di sintesi installate sul telefono. Il primo avvio avviene direttamente nel tocco sulla fotocamera per rispettare le regole audio dei browser mobili. La casella **Guida vocale** permette di disattivare o riattivare la voce.

Gli errori di caricamento o blocco audio vengono mostrati sotto la casella; le istruzioni rimangono sempre visibili. Volume multimediale e uscita Bluetooth sono controllati dal telefono. I messaggi attendono la fine di quello in corso, conservando solo la prossima indicazione più recente.

Le tracce e i testi sono in `audio/`; `python3 scripts/generate-voice.py` le rigenera su macOS con la voce italiana Alice installata.

## Come funziona e limiti

- MediaPipe Pose Landmarker 1.0.1 produce punti anatomici e maschera della persona. Il sistema passa dalla GPU alla CPU se rileva maschere vuote o errori persistenti. CPU disponibile anche tramite `Riprova AI`.
- Gli orientamenti di acquisizione sono **stime** derivate dai landmark tridimensionali delle spalle; non sono pose di camera calibrate o misure angolari certificate. Il modello può fallire soprattutto di schiena o quando parti del corpo sono occluse. I controlli su posizione e dimensioni non possono rilevare ogni movimento del telefono o della persona.
- Le silhouette vengono normalizzate rispetto all’altezza e al centro del bacino. In un Web Worker, la loro intersezione con proiezione ortografica (*visual hull*) genera un volume discreto e una mesh. **Nessun avatar standard viene usato nel risultato.**
- La griglia è 80 × 144 × 80, con passo orizzontale pari allo 0,9/80 dell’altezza (circa 2 cm per 175 cm). Il passo è una risoluzione di calcolo, **non un’accuratezza garantita**. La superficie può essere squadrata e presentare artefatti.
- Le circonferenze vengono stimate su sezioni anatomiche euristiche del volume. Il componente principale della sezione, dopo separazione di sottili ponti di voxel, è approssimato con un contorno convesso. Se le braccia si fondono col busto, i risultati possono essere sovrastimati: distanziarle è essenziale.
- Silhouette, prospettiva, abiti, capelli, postura, calibrazione e stima angolare introducono errori. Il visual hull non ricostruisce concavità invisibili nelle silhouette, texture o dettagli fini. Non è un sistema di fotogrammetria calibrata né un sensore di profondità.
- **Misure non validate per uso clinico o metrologico.** Confrontare con un metro su più persone e scansioni ripetute prima di attribuire accuratezza. Il sistema non può garantire un’altezza reale senza un riferimento correttamente posizionato.

Riferimenti: [MediaPipe Pose Landmarker Web](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js), [Laurentini, The Visual Hull Concept, 1994](https://cir.nii.ac.jp/crid/1361137044532595200).

## Dati e dipendenze

Il video è elaborato localmente. Le silhouette temporanee restano nella memoria del browser e sono eliminate con reset/annullamento/nuova scansione; non vengono caricate su un server. Solo gli export richiesti dall’utente creano file sul dispositivo. Le foto della fotocamera non vengono conservate.

Il primo caricamento richiede Internet per JavaScript/WASM da jsDelivr e modello da Google Storage. Non è garantito il funzionamento offline del modello. Il renderer 3D usa WebGL, senza ulteriori librerie esterne; il calcolo usa un Web Worker. Se il renderer non è disponibile, resta l’esportazione della mesh.

## Avvio locale e test

```sh
python3 -m http.server 8080
node --test tests/*.test.mjs
node --input-type=module --check < app.js
node --input-type=module --check < reconstruction-worker.js
```

Usare `http://localhost:8080` sul computer. Un indirizzo HTTP di rete locale sul telefono non abilita la fotocamera: usare HTTPS.

- `tests/engine-smoke.html`: inferenza CPU reale su una foto pubblica MediaPipe, senza fotocamera. Verifica la disponibilità di posa e segmentazione; non è un test di rotazione o accuratezza.
- `tests/reconstruction-smoke.html`: simulazione animata del giro completo tramite `Scan360`, con acquisizione progressiva di otto viste, quattro campioni stabili per vista, ritorno frontale, voce, worker, mesh ed export. Sagoma, orientamento e scala sono **sintetici**: il test non verifica MediaPipe o la fotocamera. La figura non è importata dall’app né usata nei risultati degli utenti.
- Test Node: calibrazione, stato dell’app, entrambe le direzioni del giro, copertura incompleta, viste ripetute, spostamenti, postura, ricostruzione di un cilindro con geometria nota, separazione del busto dalle braccia e percorso fino ai risultati.

Verifica fisica su iPhone/Android e confronto delle misure con un metro: **ancora da effettuare**. Il browser desktop a dimensioni mobili non dimostra la compatibilità su dispositivi reali.
