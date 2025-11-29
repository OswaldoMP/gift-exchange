import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Participant } from '../models/participant-entity';
import { SupabaseService } from '../services/supabase-service.service';
import { AlertService } from '../services/alert-service.service';
import { GiftEntity, Gift } from '../models/Gift';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.css']
})
export class AdminComponent implements OnInit {
  private supabaseService = inject(SupabaseService);
  private alertService = inject(AlertService);
  private router = inject(Router);

  participants = signal<Participant[]>([]);
  loading = signal<boolean>(false);
  drawLoading = signal<boolean>(false);
  expandedParticipantId = signal<string | null>(null);
  hasAssignments = signal<boolean>(false);
  showConfirm = signal<boolean>(false);
  isAdminSession = signal<boolean>(false);
  gifts = signal<GiftEntity[]>([]);
  removedGifts = signal<GiftEntity[]>([]);

  readyCount = computed(() => this.participants().filter(p => !!p.is_ready).length);
  assignedCount = computed(() => this.participants().filter(p => !!p.friend_id).length);

  async ngOnInit(): Promise<void> {
    const userId = localStorage.getItem('uuid');
    if (userId) {
      const participant = await this.supabaseService.getParticipant(userId);
      this.isAdminSession.set(!!participant.is_admin);
      if (!participant.is_admin) {
        this.router.navigate(['/intercambio']);
        return;
      }
    }
    await this.loadParticipants();
    await this.loadGifts();
  }

  async loadParticipants() {
    this.loading.set(true);
    try {
      const data = await this.supabaseService.getAllParticipants();
      this.participants.set(data);
      this.hasAssignments.set(data.some(p => !!p.friend_id));
    } catch (error) {
      console.error(error);
      this.alertService.error('No pudimos cargar la información', 'Intenta nuevamente en unos segundos.');
    } finally {
      this.loading.set(false);
    }
  }

  async loadGifts() {
    try {
      const data = await this.supabaseService.getAllGift();
      this.gifts.set(data);
    } catch (error) {
      console.error(error);
    } finally {
      this.loading.set(false);
    }
  }

  goToExchange() {
    this.router.navigate(['/intercambio']);
  }

  async performDraw() {
    if (this.drawLoading()) return;
    if (this.hasAssignments() && !this.showConfirm()) {
      this.showConfirm.set(true);
      return;
    }
    this.showConfirm.set(false);
    const list = this.participants();
    if (!list.length) {
      this.alertService.info('Sin participantes', 'Agrega participantes antes de realizar el sorteo.');
      return;
    }
    const notReady = list.filter(p => !p.is_ready);
    if (notReady.length) {
      this.alertService.warning('Participantes pendientes', 'Todos deben marcarse como listos antes de sortear.');
      return;
    }
    this.drawLoading.set(true);
    try {
      const assignments = this.createAssignments(list);
      await this.supabaseService.assignSecretSanta(assignments);
      this.alertService.success('Sorteo completado', 'Se asignaron nuevos amigos secretos.');
      await this.loadParticipants();
    } catch (error) {
      console.error(error);
      this.alertService.error('No pudimos completar el sorteo', 'Intenta nuevamente.');
    } finally {
      this.drawLoading.set(false);
    }
  }

  private createAssignments(participants: Participant[]) {
    const ids = participants.map(p => p.id as string);
    let receivers = [...ids];
    let attempts = 0;
    const maxAttempts = 50;
    do {
      receivers = this.shuffle(receivers);
      attempts += 1;
      if (attempts > maxAttempts) {
        throw new Error('No se pudieron asignar parejas válidas.');
      }
    } while (receivers.some((id, idx) => id === ids[idx]));

    return ids.map((id, idx) => ({
      id,
      friend_id: receivers[idx]
    }));
  }

  private shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  getFriendName(participant: Participant): string {
    if (!participant.friend_id) {
      return 'Sin asignar';
    }
    const friend = this.participants().find(p => p.id === participant.friend_id);
    return friend?.name || 'Asignado';
  }

  toggleDetails(participant: Participant) {
    const current = this.expandedParticipantId();
    const participantId = participant.id || null;
    this.expandedParticipantId.set(current === participantId ? null : participantId);

    const giftFilter = this.gifts()
      .filter(v => v.participant_id === participantId)
      .filter(v => v.removed === 1);
    this.removedGifts.set(giftFilter);
  }

  isExpanded(participant: Participant): boolean {
    return this.expandedParticipantId() === participant.id;
  }
}
