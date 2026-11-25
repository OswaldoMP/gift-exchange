import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Participant, UserRole } from '../models/participant-entity';
import { Exchanges, mergeExchangeConfig } from '../models/exchanges.entity';
import { LocalDbService } from '../services/local-db.service';
import { AlertService } from '../services/alert-service.service';
import { GiftEntity } from '../models/Gift';
import {
  ManualPairInput,
  buildAssignmentsWithManualOverrides,
  validateManualPairs,
} from '../utils/secret-santa-assigner';
import {
  SearchableSelectComponent,
  SelectOption,
} from '../shared/searchable-select/searchable-select.component';

type AdminTab = 'participants' | 'config';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, SearchableSelectComponent],
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.css']
})
export class AdminComponent implements OnInit {
  private localDbService = inject(LocalDbService);
  private alertService = inject(AlertService);
  private router = inject(Router);

  activeTab = signal<AdminTab>('participants');
  participants = signal<Participant[]>([]);
  loading = signal<boolean>(false);
  drawLoading = signal<boolean>(false);
  savingConfig = signal<boolean>(false);
  notifyingEmail = signal<boolean>(false);
  updatingRoleId = signal<string | null>(null);
  updatingWheelId = signal<string | null>(null);
  expandedParticipantId = signal<string | null>(null);
  hasAssignments = signal<boolean>(false);
  showConfirm = signal<boolean>(false);
  isAdminSession = signal<boolean>(false);
  currentAdminParticipantId = signal<string | null>(null);
  gifts = signal<GiftEntity[]>([]);
  removedGifts = signal<GiftEntity[]>([]);

  // Manual secret santa reassignment modal state
  showManualModal = signal<boolean>(false);
  manualSaving = signal<boolean>(false);
  manualPairs = signal<ManualPairInput[]>([{ giverId: '', receiverId: '' }]);
  manualSubmitAttempted = signal<boolean>(false);

  eventForm: Required<Exchanges> = mergeExchangeConfig();

  readyCount = computed(() => this.participants().filter(p => !!p.is_ready).length);
  assignedCount = computed(() => this.participants().filter(p => !!p.friend_id).length);
  adminCount = computed(() => this.participants().filter(p => this.isParticipantAdmin(p)).length);

  giverSelectOptions = computed<SelectOption[]>(() =>
    this.participants()
      .filter((p): p is Participant & { id: string } => Boolean(p.id))
      .map((p) => ({
        value: p.id,
        label: p.name || `Participante ${p.id}`,
        sublabel: `Actual: ${this.getFriendName(p)}${p.email ? ' · ' + p.email : ''}`,
        searchText: `${p.name || ''} ${p.email || ''}`,
      }))
  );

  receiverSelectOptions = computed<SelectOption[]>(() =>
    this.participants()
      .filter((p): p is Participant & { id: string } => Boolean(p.id))
      .map((p) => ({
        value: p.id,
        label: p.name || `Participante ${p.id}`,
        sublabel: p.email || `ID: ${p.id}`,
        searchText: `${p.name || ''} ${p.email || ''}`,
      }))
  );

  selectedManualGiverIds = computed<string[]>(() =>
    Array.from(
      new Set(
        this.manualPairs()
          .map((pair) => pair.giverId)
          .filter((id): id is string => Boolean(id?.trim()))
      )
    )
  );

  manualPreview = computed(() =>
    buildAssignmentsWithManualOverrides(this.participants(), this.manualPairs(), {
      preserveExisting: true,
    })
  );

  manualValidation = computed(() =>
    validateManualPairs(this.participants(), this.manualPairs())
  );

  activeManualPairCount = computed(
    () =>
      this.manualPairs().filter(
        (pair) => Boolean(pair.giverId?.trim()) && Boolean(pair.receiverId?.trim())
      ).length
  );

  preservedManualCount = computed(() =>
    this.manualPreview().valid ? this.manualPreview().preservedCount : 0
  );

  remainingAutoCount = computed(() =>
    this.manualPreview().valid ? this.manualPreview().autoAssignedCount : 0
  );

  async ngOnInit(): Promise<void> {
    const userId = localStorage.getItem('uuid');
    if (userId) {
      const participant = await this.localDbService.getParticipant(userId);
      const isAdmin = this.isParticipantAdmin(participant);
      this.isAdminSession.set(isAdmin);
      this.currentAdminParticipantId.set(participant.id || null);
      if (!isAdmin) {
        this.router.navigate(['/intercambio']);
        return;
      }
    }
    await Promise.all([
      this.loadParticipants(),
      this.loadGifts(),
      this.loadEventConfig(),
    ]);
  }

  setTab(tab: AdminTab): void {
    this.activeTab.set(tab);
  }

  isParticipantAdmin(participant: Participant): boolean {
    return !!participant.is_admin || participant.role === 'admin';
  }

  isCurrentAdmin(participant: Participant): boolean {
    return !!participant.id && participant.id === this.currentAdminParticipantId();
  }

  async loadParticipants(): Promise<void> {
    this.loading.set(true);
    try {
      const data = await this.localDbService.getAllParticipants();
      this.participants.set(data);
      this.hasAssignments.set(data.some(p => !!p.friend_id));
    } catch (error) {
      console.error(error);
      this.alertService.error('No pudimos cargar la información', 'Intenta nuevamente en unos segundos.');
    } finally {
      this.loading.set(false);
    }
  }

  async loadGifts(): Promise<void> {
    try {
      const data = await this.localDbService.getAllGift();
      this.gifts.set(data);
    } catch (error) {
      console.error(error);
    }
  }

  async loadEventConfig(): Promise<void> {
    try {
      const config = await this.localDbService.getInfoEvent();
      this.eventForm = { ...config };
    } catch (error) {
      console.error(error);
      this.eventForm = { ...this.localDbService.getCachedInfoEvent() };
    }
  }

  async saveEventConfig(): Promise<void> {
    if (this.savingConfig()) return;
    this.savingConfig.set(true);
    try {
      const updated = await this.localDbService.updateInfoEvent(this.eventForm);
      this.eventForm = { ...updated };
      this.alertService.success(
        'Configuración actualizada',
        'Los textos, fechas, reglas y placeholders ya se reflejan en la aplicación.'
      );
    } catch (error) {
      console.error(error);
      this.alertService.error(
        'Error al guardar configuración',
        'No se pudieron guardar los cambios. Intenta nuevamente.'
      );
    } finally {
      this.savingConfig.set(false);
    }
  }

  async toggleParticipantRole(participant: Participant, event?: Event): Promise<void> {
    event?.stopPropagation();
    if (!participant.id || this.updatingRoleId()) return;

    const currentlyAdmin = this.isParticipantAdmin(participant);
    if (currentlyAdmin && this.isCurrentAdmin(participant)) {
      this.alertService.warning(
        'Acción no permitida',
        'No puedes quitarte el rol de administrador a ti mismo.'
      );
      return;
    }

    const nextRole: UserRole = currentlyAdmin ? 'participant' : 'admin';
    this.updatingRoleId.set(participant.id);
    try {
      const updated = await this.localDbService.updateParticipantRole(participant.id, nextRole);
      this.participants.update(list =>
        list.map(item => (item.id === updated.id ? updated : item))
      );
      this.alertService.success(
        'Rol actualizado',
        nextRole === 'admin'
          ? `${participant.name} ahora tiene rol de Admin.`
          : `${participant.name} ahora tiene rol de Participante.`
      );
    } catch (error: any) {
      console.error(error);
      const message =
        error?.error?.error?.message || 'No se pudo actualizar el rol del participante.';
      this.alertService.error('Error al cambiar rol', message);
    } finally {
      this.updatingRoleId.set(null);
    }
  }

  async toggleParticipantWheel(participant: Participant, event?: Event): Promise<void> {
    event?.stopPropagation();
    if (!participant.id || this.updatingWheelId()) return;

    const nextWheelPlayed = !participant.wheel_played;
    this.updatingWheelId.set(participant.id);
    try {
      const updated = await this.localDbService.adminUpdateParticipantWheelStatus(
        participant.id,
        nextWheelPlayed
      );
      this.participants.update(list =>
        list.map(item => (item.id === updated.id ? updated : item))
      );
      this.alertService.success(
        'Estado de ruleta actualizado',
        nextWheelPlayed
          ? `Se marcó la ruleta de ${participant.name} como girada.`
          : `Se reinició la ruleta de ${participant.name}; podrá girarla de nuevo.`
      );
    } catch (error) {
      console.error(error);
      this.alertService.error(
        'Error al actualizar ruleta',
        'No se pudo modificar el estado de la ruleta.'
      );
    } finally {
      this.updatingWheelId.set(null);
    }
  }

  openManualModal(preselectedGiverId?: string, event?: Event): void {
    event?.stopPropagation();
    if (this.participants().length < 2) {
      this.alertService.info(
        'Participantes insuficientes',
        'Se necesitan al menos 2 participantes para reasignar amigos secretos.'
      );
      return;
    }
    this.manualSubmitAttempted.set(false);
    this.manualPairs.set(
      preselectedGiverId
        ? [{ giverId: preselectedGiverId, receiverId: '' }]
        : [{ giverId: '', receiverId: '' }]
    );
    this.showManualModal.set(true);
  }

  closeManualModal(): void {
    if (this.manualSaving()) return;
    this.showManualModal.set(false);
    this.manualSubmitAttempted.set(false);
  }

  onMultiGiversChange(selectedIds: string[]): void {
    if (!selectedIds.length) {
      this.manualPairs.set([{ giverId: '', receiverId: '' }]);
      return;
    }

    const existingByGiver = new Map<string, string>();
    for (const pair of this.manualPairs()) {
      if (pair.giverId) {
        existingByGiver.set(pair.giverId, pair.receiverId);
      }
    }

    const nextRows: ManualPairInput[] = selectedIds.map((giverId) => ({
      giverId,
      receiverId: existingByGiver.get(giverId) || '',
    }));
    this.manualPairs.set(nextRows);
  }

  addManualPairRow(): void {
    if (this.manualPairs().length >= this.participants().length) {
      return;
    }
    this.manualPairs.update((rows) => [...rows, { giverId: '', receiverId: '' }]);
  }

  removeManualPairRow(index: number): void {
    this.manualPairs.update((rows) => {
      if (rows.length <= 1) {
        return [{ giverId: '', receiverId: '' }];
      }
      return rows.filter((_, idx) => idx !== index);
    });
  }

  updateManualPair(
    index: number,
    field: 'giverId' | 'receiverId',
    value: string
  ): void {
    this.manualPairs.update((rows) =>
      rows.map((row, idx) => (idx === index ? { ...row, [field]: value } : row))
    );
  }

  async applyManualAssignments(): Promise<void> {
    if (this.manualSaving()) return;
    this.manualSubmitAttempted.set(true);

    if (this.activeManualPairCount() === 0) {
      this.alertService.warning(
        'Sin asignaciones manuales',
        'Selecciona al menos un participante y su amigo secreto antes de aplicar.'
      );
      return;
    }

    const result = buildAssignmentsWithManualOverrides(
      this.participants(),
      this.manualPairs(),
      { preserveExisting: true }
    );

    if (!result.valid) {
      return;
    }

    this.manualSaving.set(true);
    try {
      const assignRes = await this.localDbService.assignSecretSanta(result.assignments, true);
      const pinnedCount = this.activeManualPairCount();
      this.showManualModal.set(false);
      this.manualSubmitAttempted.set(false);
      const preservedNote =
        result.preservedCount > 0
          ? ` se conservaron ${result.preservedCount} asignación(es) previa(s) sin conflicto y`
          : '';
      const mailNote = assignRes?.notifiedCount
        ? ` Se enviaron ${assignRes.notifiedCount} notificación(es) por correo.`
        : '';
      this.alertService.success(
        'Reasignación aplicada',
        `Se fijaron ${pinnedCount} asignación(es) manual(es),${preservedNote} se reajustó a ${result.autoAssignedCount} participante(s).${mailNote}`
      );
      await this.loadParticipants();
    } catch (error: any) {
      console.error(error);
      const message =
        error?.error?.error?.message || 'No se pudieron guardar las asignaciones manuales.';
      this.alertService.error('Error al reasignar', message);
    } finally {
      this.manualSaving.set(false);
    }
  }

  goToExchange(): void {
    this.router.navigate(['/intercambio']);
  }

  async performDraw(): Promise<void> {
    if (this.drawLoading()) return;
    if (this.hasAssignments() && !this.showConfirm()) {
      this.showConfirm.set(true);
      return;
    }
    this.showConfirm.set(false);
    const list = this.participants();
    if (list.length < 2) {
      this.alertService.info('Participantes insuficientes', 'Se necesitan al menos 2 participantes para realizar el sorteo.');
      return;
    }
    const notReady = list.filter(p => !p.is_ready);
    if (notReady.length) {
      this.alertService.warning('Participantes pendientes', 'Todos deben marcarse como listos antes de sortear.');
      return;
    }
    this.drawLoading.set(true);
    try {
      const result = buildAssignmentsWithManualOverrides(list, []);
      if (!result.valid) {
        this.alertService.error('No pudimos completar el sorteo', result.errors[0] || 'Intenta nuevamente.');
        return;
      }
      const assignRes = await this.localDbService.assignSecretSanta(result.assignments, false);
      const mailNote = assignRes?.notifiedCount
        ? ` Se enviaron ${assignRes.notifiedCount} correos de notificación.`
        : '';
      this.alertService.success(
        'Sorteo completado',
        `Se asignaron nuevos amigos secretos.${mailNote}`
      );
      await this.loadParticipants();
    } catch (error) {
      console.error(error);
      this.alertService.error('No pudimos completar el sorteo', 'Intenta nuevamente.');
    } finally {
      this.drawLoading.set(false);
    }
  }

  async notifyAssignedParticipants(participant?: Participant, event?: Event): Promise<void> {
    event?.stopPropagation();
    if (this.notifyingEmail()) return;
    this.notifyingEmail.set(true);
    try {
      const res = await this.localDbService.notifySecretSanta(participant?.id);
      if (res.emailMode === 'disabled') {
        this.alertService.info(
          'Envío de correos desactivado',
          'Activa la feature flag de envío de correos en Configuración para enviar notificaciones.'
        );
        return;
      }
      const modeText =
        res.emailMode === 'smtp'
          ? 'enviado(s) por SMTP'
          : 'generado(s) en modo local (server/data/outbox)';
      this.alertService.success(
        'Notificación enviada',
        `${res.notifiedCount} correo(s) de amigo secreto ${modeText}.`
      );
    } catch (error) {
      console.error(error);
      this.alertService.error(
        'Error al notificar',
        'No se pudieron enviar las notificaciones por correo.'
      );
    } finally {
      this.notifyingEmail.set(false);
    }
  }

  getFriendName(participant: Participant): string {
    if (!participant.friend_id) {
      return 'Sin asignar';
    }
    const friend = this.participants().find(p => p.id === participant.friend_id);
    return friend?.name || 'Asignado';
  }

  toggleDetails(participant: Participant): void {
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
