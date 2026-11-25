import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { Participant } from '../models/participant-entity';
import { Gift } from '../models/Gift';
import { ParticipantServiceService } from '../services/participant-service.service';
import { FormsModule } from '@angular/forms';
import { LocalDbService } from '../services/local-db.service';
import { Exchanges, mergeExchangeConfig } from '../models/exchanges.entity';
import { ActivatedRoute, Router } from '@angular/router';

export interface WheelSlice {
  id: string;
  label: string;
  fullName: string;
  path: string;
  color: string;
  textTransform: string;
  fontSize: number;
}

export interface WheelBulb {
  cx: number;
  cy: number;
  color: string;
  delay: string;
}

const CHRISTMAS_SLICE_PALETTE = [
  '#c41e3a', // Cranberry Red
  '#146b3a', // Pine Emerald
  '#c9932c', // Festive Gold
  '#8f1d2c', // Holly Crimson
  '#0f4c3a', // Deep Evergreen
  '#a66d1f', // Warm Amber
];

const BULB_PALETTE = ['#ffe082', '#ff5a72', '#52e5a5', '#fff8e1'];

@Component({
  selector: 'app-exchange',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './exchange.component.html',
  styleUrl: './exchange.component.css'
})
export class ExchangeComponent implements OnInit, OnDestroy {

  private router = inject(Router);

  currentUser: Participant = {
    name: '',
    gifts: [],
    avatarUrl: ''
  };
  participants: Participant[] = [];
  drawResult: any = false;

  expandedUserId: string | null = null;
  selectedGift: Gift | null = null;
  newGift: Gift | null = null;
  userEmail: string = '';
  assignedFriend: any;
  wheelAlreadyPlayed = false;
  showWheelOverlay = false;
  wheelSpinning = false;
  wheelRevealFinished = false;
  wheelRotation = 0;
  wheelDuration = 5400;
  showConfetti = false;
  confettiPieces = Array.from({ length: 42 }).map((_, index) => index);
  wheelStaticAngle = 0;
  readonly wheelBulbs: WheelBulb[] = this.buildWheelBulbs();
  private audioCtx?: AudioContext;
  private spinOscillator?: OscillatorNode;
  private spinGain?: GainNode;
  private wheelTimeout?: ReturnType<typeof setTimeout>;
  private confettiTimeout?: ReturnType<typeof setTimeout>;

  eventConfig = signal<Required<Exchanges>>(mergeExchangeConfig());
  isAdminUser = signal<boolean>(false);
  showConfirm = signal<boolean>(false);
  showTextDraw = signal<string>('');

  constructor(
    public participantService: ParticipantServiceService,
    public localDbService: LocalDbService,
    public route: ActivatedRoute
  ) {
    this.eventConfig.set(localDbService.getCachedInfoEvent());
    const uuid = localStorage.getItem('uuid') as string;
    if (uuid) {
      localDbService.getParticipant(uuid).then(res => {
        this.currentUser = res;
        this.drawResult = this.currentUser.is_ready;
        this.assignedFriend = this.currentUser.friend_id;
        this.wheelAlreadyPlayed = Boolean(this.currentUser.wheel_played);
        this.isAdminUser.set(!!this.currentUser.is_admin || this.currentUser.role === 'admin');
      });
      localDbService.getParticipants(uuid).then(res => {
        this.participants = res;
      });
    }
  }

  ngOnInit(): void {
    this.route.snapshot.queryParamMap.get('email');
    this.localDbService
      .getInfoEvent()
      .then((event) => this.eventConfig.set(event))
      .catch(() => this.eventConfig.set(this.localDbService.getCachedInfoEvent()));
  }

  ngOnDestroy(): void {
    this.stopSpinSound();
    clearTimeout(this.wheelTimeout);
    clearTimeout(this.confettiTimeout);
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => undefined);
    }
  }

  // Computed
  get isDrawn() {
    return this.drawResult;
  }

  get myAssignedFriend(): Participant | null {
    if (!this.isDrawn) return null;

    return this.participants.find(p => p.id === this.assignedFriend) || null;
  }

  get wheelSlices(): WheelSlice[] {
    const list = this.participants || [];
    const total = list.length;
    if (!total) {
      return [];
    }

    const cx = 200;
    const cy = 200;
    const radius = 194;
    const sliceDeg = 360 / total;
    const fontSize = this.getWheelFontSize(total);

    return list.map((participant, index) => {
      const startDeg = index * sliceDeg - 90;
      const endDeg = (index + 1) * sliceDeg - 90;
      const midDeg = (startDeg + endDeg) / 2;

      let path: string;
      if (total === 1) {
        path = `M ${cx} ${cy - radius} A ${radius} ${radius} 0 1 1 ${cx - 0.01} ${cy - radius} Z`;
      } else {
        const startRad = (startDeg * Math.PI) / 180;
        const endRad = (endDeg * Math.PI) / 180;
        const x1 = cx + radius * Math.cos(startRad);
        const y1 = cy + radius * Math.sin(startRad);
        const x2 = cx + radius * Math.cos(endRad);
        const y2 = cy + radius * Math.sin(endRad);
        const largeArc = sliceDeg > 180 ? 1 : 0;
        path = `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
      }

      let color = CHRISTMAS_SLICE_PALETTE[index % CHRISTMAS_SLICE_PALETTE.length];
      if (total > 1 && index === total - 1 && color === CHRISTMAS_SLICE_PALETTE[0]) {
        color = '#1b7a4c';
      }

      const fullName = participant.name || `Participante ${index + 1}`;
      return {
        id: participant.id || String(index),
        label: this.formatWheelLabel(fullName, total),
        fullName,
        path,
        color,
        textTransform: `rotate(${midDeg.toFixed(2)} ${cx} ${cy})`,
        fontSize,
      };
    });
  }

  get canAddGift(): boolean {
    return (this.currentUser?.gifts?.length ?? 0) < 5;
  }

  // UI actions
  toggleUserExpand(userId: string) {
    this.expandedUserId = this.expandedUserId === userId ? null : userId;
  }

  openGift(gift: Gift) {
    this.selectedGift = { ...gift };
    document.body.style.overflow = 'hidden';
  }

  openDialogNewGift() {
    this.newGift = {
      id: '',
      title: '',
      store: '',
      link: ''
    };
    document.body.style.overflow = 'hidden';
  }

  async closeGift() {
    this.selectedGift = null;
    this.newGift = null;
    document.body.style.overflow = '';

    const uuid = localStorage.getItem('uuid');
    if (uuid) {
      this.currentUser = await this.localDbService.getParticipant(uuid);
    }
  }

  async requestDraw() {
    if (!this.showConfirm()) {
      this.showConfirm.set(true);
      let text = `Recuerda que una vez confirmado el sorteo de ${this.eventConfig().event_title} no hay marcha atrás.\n¿Deseas continuar?`;
      if (this.currentUser.gifts.length < 3) {
        text = `¿Sin ideas? Recuerda que una vez confirmado el sorteo de ${this.eventConfig().event_title} no hay marcha atrás.\n¡Aún puedes agregar más regalos!`;
      }
      this.showTextDraw.set(text);
      return;
    }
    this.showConfirm.set(false);
    this.showTextDraw.set('');
    await this.localDbService.updatedParticipantToReady(localStorage.getItem('uuid') as string, true);
    this.drawResult = true;
  }

  async addGift(gift: Gift) {
    if (!gift.title?.trim() || !this.currentUser?.id) return;
    await this.localDbService.saveGift(gift, this.currentUser.id);
    await this.closeGift();
  }

  async removeGift(gift: Gift) {
    await this.localDbService.updateGift(gift, 1);
    await this.closeGift();
  }

  async updateGift(gift: Gift) {
    await this.localDbService.updateGift(gift, 0);
    await this.closeGift();
  }

  startWheelReveal() {
    if (!this.myAssignedFriend || this.wheelAlreadyPlayed) return;

    const totalParticipants = this.participants.length || 1;
    const assignedIndex = Math.max(
      this.participants.findIndex(p => p.id === this.myAssignedFriend?.id),
      0
    );
    const sliceSize = 360 / totalParticipants;
    const midClockwise = assignedIndex * sliceSize + sliceSize / 2;
    const landingOffset = (360 - midClockwise + 360) % 360;
    this.wheelRotation = 360 * 6 + landingOffset;
    this.wheelStaticAngle = 0;

    this.showWheelOverlay = true;
    this.wheelSpinning = true;
    this.wheelRevealFinished = false;
    this.showConfetti = false;
    this.startSpinSound();

    clearTimeout(this.wheelTimeout);
    clearTimeout(this.confettiTimeout);

    this.wheelTimeout = setTimeout(() => {
      this.wheelSpinning = false;
      this.wheelRevealFinished = true;
      this.showConfetti = true;
      this.wheelAlreadyPlayed = true;
      this.currentUser = { ...this.currentUser, wheel_played: true };
      this.wheelStaticAngle = ((this.wheelRotation % 360) + 360) % 360;
      this.stopSpinSound();
      this.playConfettiSound();

      const uuid = localStorage.getItem('uuid');
      if (uuid) {
        this.localDbService.updateParticipantWheelStatus(uuid, true).catch(() => undefined);
      }

      this.confettiTimeout = setTimeout(() => {
        this.showConfetti = false;
      }, 3200);
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

  private buildWheelBulbs(): WheelBulb[] {
    const count = 24;
    const cx = 220;
    const cy = 220;
    const radius = 207;
    return Array.from({ length: count }).map((_, index) => {
      const angleRad = ((index * (360 / count) - 90) * Math.PI) / 180;
      return {
        cx: Number((cx + radius * Math.cos(angleRad)).toFixed(2)),
        cy: Number((cy + radius * Math.sin(angleRad)).toFixed(2)),
        color: BULB_PALETTE[index % BULB_PALETTE.length],
        delay: `${(index % 4) * 0.28}s`,
      };
    });
  }

  private getWheelFontSize(total: number): number {
    if (total <= 8) return 14;
    if (total <= 15) return 11.5;
    if (total <= 25) return 9.2;
    if (total <= 35) return 7.6;
    return 6.2;
  }

  private formatWheelLabel(name: string, total: number): string {
    const clean = name.trim();
    const maxChars = total <= 12 ? 16 : total <= 25 ? 13 : 10;
    if (clean.length <= maxChars) {
      return clean;
    }
    const parts = clean.split(/\s+/);
    if (parts.length > 1) {
      const compact = `${parts[0]} ${parts[1][0]}.`;
      if (compact.length <= maxChars) {
        return compact;
      }
    }
    return `${clean.slice(0, maxChars - 1)}…`;
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
    osc.frequency.setValueAtTime(240, ctx.currentTime);
    const duration = this.wheelDuration / 1000;
    osc.frequency.exponentialRampToValueAtTime(520, ctx.currentTime + duration * 0.45);
    osc.frequency.exponentialRampToValueAtTime(280, ctx.currentTime + duration);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.25);
    gain.gain.linearRampToValueAtTime(0.015, ctx.currentTime + duration);
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
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + idx * 0.09;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.11, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.46);
    });
  }

  addParticiapant() {
    const participant: Participant = {
      name: 'Adrian Oswaldo',
      gifts: []
    };
    this.localDbService.saveParticipant(participant).catch(() => {
      // handled silently
    });
  }

  async signOut() {
    const { error } = await this.localDbService.signOut();
    if (error) {
      console.error('Error signing out:', error.message);
    } else {
      localStorage.removeItem('uuid');
      localStorage.removeItem('username');
      localStorage.removeItem('auth_token');
      this.router.navigate(['/login']);
    }
  }

  goToAdminDashboard() {
    this.router.navigate(['/admin']);
  }
}
