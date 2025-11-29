import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { Participant } from '../models/participant-entity';
import { Gift } from '../models/Gift';
import { ParticipantServiceService } from '../services/participant-service.service';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../services/supabase-service.service';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';

@Component({
  selector: 'app-exchange',
  standalone: true,
  imports: [CommonModule, FormsModule],
  // templateUrl: './exchange.component.html',
  templateUrl: './exchange.component.html',
  styleUrl: './exchange.component.css'
})
export class ExchangeComponent implements OnInit, OnDestroy {

  private router = inject(Router);

  currentUser!: Participant;
  participants: Participant[] = [];
  drawResult: any = false;


  expandedUserId: string | null = null;
  selectedGift: Gift | null = null;
  newGift: Gift | null = null;
  userEmail: string = "";
  assignedFriend: any;
  wheelAlreadyPlayed = false;
  showWheelOverlay = false;
  wheelSpinning = false;
  wheelRotation = 0;
  wheelDuration = 5200;
  showConfetti = false;
  confettiPieces = Array.from({ length: 28 }).map((_, index) => index);
  wheelStaticAngle = 0;
  private audioCtx?: AudioContext;
  private spinOscillator?: OscillatorNode;
  private spinGain?: GainNode;
  private wheelTimeout?: ReturnType<typeof setTimeout>;
  private confettiTimeout?: ReturnType<typeof setTimeout>;

  dateEvent = signal<string>("");
  timeEvent = signal<string>("");
  moneyEvent = signal<string>("");
  startEvent = signal<string>("");
  uploadGift = signal<string>("");
  isAdminUser = signal<boolean>(false);

  constructor(
    public participantService: ParticipantServiceService,
    public supabaseService: SupabaseService,
    public route: ActivatedRoute
  ) {
    supabaseService.getParticipant(localStorage.getItem("uuid") as string).then(res => {
      this.currentUser = res;
      this.drawResult = this.currentUser.is_ready;
      this.assignedFriend = this.currentUser.friend_id;
      this.isAdminUser.set(!!this.currentUser.is_admin);
      if (this.currentUser?.id) {
        const storageKey = this.getWheelStorageKey();
        this.wheelAlreadyPlayed = localStorage.getItem(storageKey) === 'true';
      }
    });
    supabaseService.getParticipants(localStorage.getItem("uuid") as string).then(res => {
      this.participants = res;
    });
  }

  ngOnInit(): void {
    this.route.snapshot.queryParamMap.get('email');
    this.getInfoEvent();
  }

  ngOnDestroy(): void {
    this.stopSpinSound();
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => undefined);
    }
  }

  // Computed
  get isDrawn() {
    return this.drawResult;
    // return this.drawResult === false;
  }


  get myAssignedFriend(): Participant | null {
    if (!this.isDrawn) return null;

    return this.participants.find(p => p.id === this.assignedFriend) || null;
  }

  get wheelGradient(): string {
    if (!this.participants?.length) {
      return '#0f1f2e';
    }
    const palette = ['#f97b90', '#66d7d1', '#f7c56a', '#78e6b2', '#bcd9ff', '#ff9bad'];
    const slices = this.participants.map((_, index) => {
      const start = (index / this.participants.length) * 360;
      const end = ((index + 1) / this.participants.length) * 360;
      const color = palette[index % palette.length];
      return `${color} ${start}deg ${end}deg`;
    });
    return `conic-gradient(${slices.join(',')})`;
  }

  get canAddGift(): boolean {
    return this.currentUser.gifts.length < 5;
  }


  // UI actions
  toggleUserExpand(userId: string) {
    this.expandedUserId = this.expandedUserId === userId ? null : userId;
  }


  openGift(gift: Gift) {
    this.selectedGift = gift;
    // prevent background scroll if wanted
    document.body.style.overflow = 'hidden';
  }

  openDialogNewGift() {
    this.newGift = {
      id: "",
      title: "",
      store: "",
      link: ""
    }
    document.body.style.overflow = 'hidden';
  }


  closeGift() {
    this.selectedGift = null;
    this.newGift = null;
    document.body.style.overflow = '';

    // Refresh
    this.supabaseService.getParticipant(localStorage.getItem("uuid") as string).then(res => {
      this.currentUser = res;
    });
  }


  // Placeholder: función para disparar el sorteo (probablemente en el backend)
  async requestDraw() {
    // emit event o llamada a servicio; aquí solo un ejemplo de cómo se podría indicar
    await this.supabaseService.updatedParticipantToReady(localStorage.getItem("uuid") as string, true);
    this.drawResult = true;
  }

  addGift(gift: Gift) {
    this.supabaseService.saveGift(gift, this.currentUser.id as string)
    this.closeGift();
  }

  removeGift(gift: Gift) {
    this.supabaseService.updateGift(gift, 1);
    this.closeGift();
  }

  updateGift(gift: Gift) {
    this.supabaseService.updateGift(gift, 0);
    this.closeGift();
  }

  startWheelReveal() {
    if (!this.myAssignedFriend || this.wheelAlreadyPlayed) return;

    const totalParticipants = this.participants.length || 1;
    const assignedIndex = Math.max(
      this.participants.findIndex(p => p.id === this.myAssignedFriend?.id),
      0
    );
    const sliceSize = 360 / totalParticipants;
    const targetAngle = assignedIndex * sliceSize + sliceSize / 2;
    const pointerAngle = 270; // apuntando hacia la parte superior
    const diff = (pointerAngle - targetAngle + 360) % 360;
    this.wheelRotation = 1440 + diff;
    this.wheelStaticAngle = 0;

    this.showWheelOverlay = true;
    this.wheelSpinning = true;
    this.showConfetti = false;
    this.startSpinSound();

    clearTimeout(this.wheelTimeout);
    clearTimeout(this.confettiTimeout);

    this.wheelTimeout = setTimeout(() => {
      this.wheelSpinning = false;
      this.showConfetti = true;
      this.wheelAlreadyPlayed = true;
      this.wheelStaticAngle = ((this.wheelRotation % 360) + 360) % 360;
      this.stopSpinSound();
      this.playConfettiSound();
      if (this.currentUser?.id) {
        localStorage.setItem(this.getWheelStorageKey(), 'true');
      }
      this.confettiTimeout = setTimeout(() => {
        this.showConfetti = false;
      }, 2500);
    }, this.wheelDuration);
  }

  closeWheelOverlay(force = false) {
    if (this.wheelSpinning && !force) return;
    this.showWheelOverlay = false;
    this.showConfetti = false;
    this.stopSpinSound();
    clearTimeout(this.wheelTimeout);
    clearTimeout(this.confettiTimeout);
  }

  wheelLabelTransform(index: number): string {
    const total = this.participants.length || 1;
    const sliceSize = 360 / total;
    const angle = index * sliceSize + sliceSize / 2;
    const wheelAngle = ((this.wheelStaticAngle % 360) + 360) % 360;
    const compensate = angle + wheelAngle;
    return `rotate(${angle}deg) translateY(-50%) rotate(${-compensate}deg)`;
  }

  private getWheelStorageKey() {
    return `wheel-spin-${this.currentUser?.id}`;
  }

  private ensureAudioContext(): AudioContext | undefined {
    if (typeof window === 'undefined') return undefined;
    if (!this.audioCtx) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return undefined;
      this.audioCtx = new Ctx();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => undefined);
    }
    return this.audioCtx;
  }

  private startSpinSound() {
    const ctx = this.ensureAudioContext();
    if (!ctx) return;
    this.stopSpinSound();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, ctx.currentTime);
    const duration = this.wheelDuration / 1000;
    osc.frequency.linearRampToValueAtTime(660, ctx.currentTime + duration);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    this.spinOscillator = osc;
    this.spinGain = gain;
  }

  private stopSpinSound() {
    if (!this.spinOscillator || !this.spinGain || !this.audioCtx) return;
    const now = this.audioCtx.currentTime;
    this.spinGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
    this.spinOscillator.stop(now + 0.2);
    this.spinOscillator.disconnect();
    this.spinGain.disconnect();
    this.spinOscillator = undefined;
    this.spinGain = undefined;
  }

  private playConfettiSound() {
    const ctx = this.ensureAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.4);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  }


  addParticiapant() {
    const participant: Participant = {
      name: "Adrian Oswaldo",
      gifts: []
    }
    this.supabaseService.saveParticipant(participant).catch(() => {
      // handled silently
    });
  }

  async signOut() {
    const { error } = await this.supabaseService.signOut();
    if (error) {
      console.error("Error signing out:", error.message);
    } else {
      // Optionally, redirect the user to a login page or home page
      localStorage.clear();
      localStorage.setItem(this.getWheelStorageKey(), 'true');
      this.router.navigate(['/login']);
    }
  }

  getInfoEvent() {
    const event = JSON.parse(localStorage.getItem("event") as string);

    this.dateEvent.set(event.date_event);
    this.timeEvent.set(event.time_event);
    this.moneyEvent.set(event.money_event);
    this.startEvent.set(event.start_event);
    this.uploadGift.set(event.upload_gift);
  }
  // TODO
  // Crear una funcion que haga una animacion de ruleta para asignar el amigo secreto. Esta funcion se ejecutara por un boton

  goToAdminDashboard() {
    this.router.navigate(['/admin']);
  }
}
