// Keep utterances alive, serialize prompts, and surface mobile playback failures.
export class VoiceGuide {
  constructor({ synth, Utterance, status, setTimer=(fn,ms)=>setTimeout(fn,ms), clearTimer=id=>clearTimeout(id) }) {
    this.synth=synth;this.Utterance=Utterance;this.status=status;
    this.setTimer=setTimer;this.clearTimer=clearTimer;this.active=null;this.pending=null;this.timer=null;this.generation=0;
    this.supported=!!synth && typeof Utterance==='function';
    this.refreshVoices=()=>{try{this.voices=this.synth?.getVoices?.() || [];}catch{this.voices=[];}};
    this.refreshVoices();synth?.addEventListener?.('voiceschanged',this.refreshVoices);
    status(this.supported?'Premi “Prova voce” per attivare e verificare l’audio.':'Sintesi vocale non disponibile in questo browser. Le istruzioni restano visibili.');
  }
  speak(text) {
    if(!this.supported)return false;
    if(this.active){this.pending=text;return true;}
    this.refreshVoices();
    const utterance=new this.Utterance(text),generation=this.generation;
    utterance.lang='it-IT';utterance.rate=.95;utterance.pitch=1;utterance.volume=1;
    const italian=this.voices.filter(v=>/^it(?:-|_)/i.test(v.lang)||v.lang==='it');
    const selected=italian.find(v=>v.localService) || italian[0];
    if(selected)utterance.voice=selected;
    this.active=utterance;
    const current=()=>generation===this.generation && this.active===utterance;
    utterance.onstart=()=>{
      if(!current())return;
      this.clearTimer(this.timer);this.status('Riproduzione della guida vocale in corso.');
      this.timer=this.setTimer(()=>{if(current())this.fail('La voce si è interrotta. Premi “Prova voce” per riattivarla.');},Math.max(15000,text.length*140));
    };
    utterance.onend=()=>{
      if(!current())return;
      this.clearTimer(this.timer);this.timer=null;this.active=null;
      const next=this.pending;this.pending=null;
      if(next)this.speak(next);else this.status('Voce pronta. Se non senti l’audio, controlla volume, modalità silenziosa e uscita Bluetooth.');
    };
    utterance.onerror=event=>{
      if(!current())return;
      this.fail(event.error==='not-allowed'?'Il browser richiede un tocco: premi “Prova voce”.':'Audio non disponibile. Premi “Prova voce”; controlla volume e uscita audio del telefono.');
    };
    this.status('Avvio della voce…');
    this.timer=this.setTimer(()=>{if(current())this.fail('Il browser non ha avviato la voce. Premi “Prova voce” e controlla volume e modalità silenziosa.');},5000);
    try {
      if(this.synth.paused)this.synth.resume();
      // Must run synchronously inside the tap handler for initial activation.
      this.synth.speak(utterance);
    } catch {this.fail('Impossibile avviare la voce. Riprova in Safari o Chrome.');return false;}
    return true;
  }
  fail(message){this.stop();this.status(message);}
  stop(){
    this.generation++;this.clearTimer(this.timer);this.timer=null;this.pending=null;
    const hadActive=!!this.active;this.active=null;
    if(hadActive){try{this.synth.cancel();}catch{/* Playback state must not block scanning. */}}
  }
  test(){
    // No unconditional cancel immediately before speak: some mobile engines
    // drop that new utterance. If already playing, its events provide feedback.
    if(this.active){this.status('La voce è già in riproduzione. Controlla il volume se non la senti.');return;}
    this.speak('Guida vocale attiva. Segui le istruzioni per completare la scansione a trecentosessanta gradi.');
  }
}
