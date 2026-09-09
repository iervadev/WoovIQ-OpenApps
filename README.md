# WoovIQ BodyScan AI — MVP

Webapp/PWA dimostrativa per acquisizione frontale e laterale tramite fotocamera e stima antropometrica.

## Funzioni
- accesso fotocamera via `getUserMedia`;
- guida frontale/laterale;
- elaborazione locale nel browser;
- altezza calibrata dall'utente;
- stima di spalle, torace, vita, fianchi, coscia, peso e BMI;
- nessun upload delle immagini.

## Avvio locale
La fotocamera richiede HTTPS o localhost.

```bash
python3 -m http.server 8080
```

Aprire `http://localhost:8080`.

## Limiti MVP
Le misure sono stime sperimentali basate sulla silhouette e non sono validate per uso medico o metrologico. Una versione di produzione dovrebbe integrare pose estimation/segmentation robusta, calibrazione geometrica, dataset di validazione e — per il peso reale — una pedana con celle di carico.