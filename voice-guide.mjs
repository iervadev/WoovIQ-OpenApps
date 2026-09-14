// Bundled Italian audio uses the media player, independently of phone TTS voices.
export function clipFor(text) {
  if(text.startsWith('Avvio della fotocamera'))return 'camera';
  if(text.startsWith('Premi prima Avvia'))return 'camera-required';
  if(text.includes('si sta caricando'))return 'ai-loading';
  if(text.includes('non è pronto'))return 'ai-error';
  if(/Calibra|Completa i due tocchi/.test(text))return 'calibration';
  if(/Corpo incompleto|Inquadra tutto/.test(text))return 'body';
  if(text.startsWith('Guarda la fotocamera. Resta'))return 'start';
  if(text.startsWith('Raddrizza'))return 'straight';
  if(text.startsWith('Allontana'))return 'arms';
  if(text.startsWith('Per iniziare'))return 'front';
  if(text.startsWith('Resta sullo stesso'))return 'position';
  if(text.startsWith('Ruota lentamente'))return 'rotate';
  if(text.startsWith('Torna alla posa'))return 'pose';
  if(text.startsWith('Giro completo'))return 'complete';
  if(text.includes('Completa il giro'))return 'return';
  if(/^Vista .* acquisita/.test(text))return 'captured';
  return null;
}
export class VoiceGuide {
  constructor({player,status,setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id)}) {
    this.player=player;this.status=status;this.setTimer=setTimer;this.clearTimer=clearTimer;
    this.supported=typeof player?.play==='function' && typeof player?.pause==='function';
    this.active=null;this.pending=null;this.generation=0;this.timer=null;this.blocked=false;
    if(this.supported){
      player.preload='auto';player.src='./audio/camera.m4a';
      player.addEventListener('playing',()=>{
        if(!this.active)return;
        this.clearTimer(this.timer);this.timer=null;
        this.status('Guida vocale in riproduzione.');
      });
      player.addEventListener('ended',()=>{
        if(!this.active)return;
        this.clearTimer(this.timer);this.timer=null;this.active=null;
        const next=this.pending;this.pending=null;
        if(next)this.playClip(next);else this.status('Guida vocale attiva: seguirà i passaggi della scansione.');
      });
      player.addEventListener('error',()=>{if(this.active)this.fail('File audio non disponibile. Controlla la connessione e riavvia la fotocamera.');});
    }
    status(this.supported?'La voce parte automaticamente con “Avvia fotocamera”.':'Audio non disponibile in questo browser. Le istruzioni restano visibili.');
  }
  speak(text){const clip=clipFor(text);return clip ? this.playClip(clip) : false;}
  activate(){this.blocked=false;return this.playClip('ready');}
  playClip(clip){
    if(!this.supported || this.blocked)return false;
    if(this.active){if(clip!==this.active)this.pending=clip;return true;}
    const generation=++this.generation;
    this.active=clip;
    const current=()=>this.generation===generation && this.active===clip;
    this.player.src=`./audio/${clip}.m4a`;this.player.muted=false;this.player.volume=1;
    this.status('Caricamento della guida vocale…');
    this.timer=this.setTimer(()=>{if(current())this.fail('Audio non avviato. Controlla la connessione e riavvia la fotocamera.');},15000);
    try {
      // First call is synchronous within the camera/scan tap; reuse this element.
      const playing=this.player.play();
      playing?.catch(error=>{
        if(!current())return;
        this.fail(error.name==='NotAllowedError'?'Il browser ha bloccato l’audio. Riattiva “Guida vocale” con un tocco.':'Impossibile riprodurre la guida. Controlla la connessione e riavvia la fotocamera.');
      });
    }catch{this.fail('Impossibile riprodurre la guida vocale.');return false;}
    return true;
  }
  fail(message){this.stop();this.blocked=true;this.status(message);}
  stop(){
    this.generation++;this.clearTimer(this.timer);this.timer=null;this.active=null;this.pending=null;this.blocked=false;
    if(this.supported)this.player.pause();
  }
}
