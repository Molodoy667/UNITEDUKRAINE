export class RouletteSound {
  private context:AudioContext|null=null;
  private volume:GainNode|null=null;
  private motor:OscillatorNode|null=null;
  private noise:AudioBufferSourceNode|null=null;
  private filter:BiquadFilterNode|null=null;
  muted=false;
  async unlock(){try{this.context??=new AudioContext();await this.context.resume();}catch{}}
  start(){
    this.stop();const ctx=this.context;if(!ctx)return;
    const master=ctx.createGain();master.gain.value=this.muted?0:.15;master.connect(ctx.destination);this.volume=master;
    const buffer=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate),samples=buffer.getChannelData(0);
    for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*.26;
    const noise=ctx.createBufferSource();noise.buffer=buffer;noise.loop=true;
    const filter=ctx.createBiquadFilter();filter.type='bandpass';filter.frequency.value=500;filter.Q.value=.6;noise.connect(filter);filter.connect(master);noise.start();this.noise=noise;this.filter=filter;
    const motor=ctx.createOscillator(),gain=ctx.createGain();motor.type='triangle';motor.frequency.value=75;gain.gain.value=.07;motor.connect(gain);gain.connect(master);motor.start();this.motor=motor;
  }
  speed(amount:number){if(!this.context)return;this.motor?.frequency.setTargetAtTime(45+amount*90,this.context.currentTime,.08);this.filter?.frequency.setTargetAtTime(200+amount*1100,this.context.currentTime,.08);}
  tick(){const ctx=this.context;if(!ctx||!this.volume||this.muted)return;const oscillator=ctx.createOscillator(),gain=ctx.createGain();oscillator.type='sine';oscillator.frequency.setValueAtTime(1700,ctx.currentTime);oscillator.frequency.exponentialRampToValueAtTime(450,ctx.currentTime+.026);gain.gain.setValueAtTime(.22,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.035);oscillator.connect(gain);gain.connect(this.volume);oscillator.start();oscillator.stop(ctx.currentTime+.04);}
  finish(){this.stop();const ctx=this.context;if(!ctx||this.muted)return;[523.25,659.25,783.99,1046.5].forEach((frequency,index)=>{const oscillator=ctx.createOscillator(),gain=ctx.createGain(),start=ctx.currentTime+index*.085;oscillator.type='sine';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.07,start+.025);gain.gain.exponentialRampToValueAtTime(.001,start+.9);oscillator.connect(gain);gain.connect(ctx.destination);oscillator.start(start);oscillator.stop(start+.95);});}
  mute(value:boolean){this.muted=value;if(this.context)this.volume?.gain.setTargetAtTime(value?0:.15,this.context.currentTime,.05);}
  stop(){try{this.motor?.stop();this.noise?.stop();}catch{}this.motor=null;this.noise=null;this.filter=null;this.volume?.disconnect();this.volume=null;}
  dispose(){this.stop();void this.context?.close().catch(()=>{});this.context=null;}
}
