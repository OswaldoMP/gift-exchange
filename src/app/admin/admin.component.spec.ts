import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AdminComponent } from './admin.component';
import { LocalDbService } from '../services/local-db.service';
import { AlertService } from '../services/alert-service.service';
import { DEFAULT_EXCHANGE_CONFIG } from '../models/exchanges.entity';
import { Participant } from '../models/participant-entity';

describe('AdminComponent', () => {
  let fixture: ComponentFixture<AdminComponent>;
  let component: AdminComponent;
  let localDbSpy: jasmine.SpyObj<LocalDbService>;

  const adminUser: Participant = {
    id: '1',
    name: 'Administrador',
    email: 'admin@intercambio2026.local',
    is_admin: true,
    role: 'admin',
    is_ready: true,
    gifts: [],
  };

  const regularUser: Participant = {
    id: '2',
    name: 'Laura Gómez',
    email: 'laura@navidad2026.com',
    is_admin: false,
    role: 'participant',
    is_ready: true,
    gifts: [],
  };

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('uuid', 'admin-oauth');

    localDbSpy = jasmine.createSpyObj<LocalDbService>('LocalDbService', [
      'getParticipant',
      'getAllParticipants',
      'getAllGift',
      'getInfoEvent',
      'getCachedInfoEvent',
      'updateInfoEvent',
      'updateParticipantRole',
      'adminUpdateParticipantWheelStatus',
      'assignSecretSanta',
      'notifySecretSanta',
    ]);
    localDbSpy.getParticipant.and.resolveTo(adminUser);
    localDbSpy.getAllParticipants.and.resolveTo([adminUser, regularUser]);
    localDbSpy.getAllGift.and.resolveTo([]);
    localDbSpy.getInfoEvent.and.resolveTo(DEFAULT_EXCHANGE_CONFIG);
    localDbSpy.getCachedInfoEvent.and.returnValue(DEFAULT_EXCHANGE_CONFIG);

    const routerSpy = jasmine.createSpyObj<Router>('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [AdminComponent],
      providers: [
        AlertService,
        { provide: LocalDbService, useValue: localDbSpy },
        { provide: Router, useValue: routerSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminComponent);
    component = fixture.componentInstance;
    await component.ngOnInit();
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('promotes a participant to admin and updates list state', async () => {
    localDbSpy.updateParticipantRole.and.resolveTo({
      ...regularUser,
      is_admin: true,
      role: 'admin',
    });

    await component.toggleParticipantRole(regularUser);

    expect(localDbSpy.updateParticipantRole).toHaveBeenCalledWith('2', 'admin');
    expect(component.adminCount()).toBe(2);
  });

  it('prevents current admin from demoting themselves', async () => {
    await component.toggleParticipantRole(adminUser);
    expect(localDbSpy.updateParticipantRole).not.toHaveBeenCalled();
  });

  it('saves updated configurable event texts and placeholders', async () => {
    component.eventForm.event_title = 'Intercambio Oficina 2026';
    component.eventForm.money_event = '$650 MXN';
    component.eventForm.rules_text = 'Traer regalo envuelto.';
    component.eventForm.email_notifications_enabled = false;

    localDbSpy.updateInfoEvent.and.resolveTo({ ...component.eventForm });

    await component.saveEventConfig();

    expect(localDbSpy.updateInfoEvent).toHaveBeenCalledWith(
      jasmine.objectContaining({
        event_title: 'Intercambio Oficina 2026',
        money_event: '$650 MXN',
        rules_text: 'Traer regalo envuelto.',
        email_notifications_enabled: false,
      })
    );
  });

  it('toggles participant wheel_played status from admin panel', async () => {
    localDbSpy.adminUpdateParticipantWheelStatus.and.resolveTo({
      ...regularUser,
      wheel_played: true,
    });

    await component.toggleParticipantWheel(regularUser);

    expect(localDbSpy.adminUpdateParticipantWheelStatus).toHaveBeenCalledWith('2', true);
    expect(component.participants().find(p => p.id === '2')?.wheel_played).toBeTrue();
  });

  it('applies manual reassignment and auto-reassigns remaining participants', async () => {
    const thirdUser: Participant = {
      id: '3',
      name: 'Carlos Ruiz',
      email: 'carlos@navidad2026.com',
      is_admin: false,
      role: 'participant',
      is_ready: true,
      gifts: [],
    };
    component.participants.set([adminUser, regularUser, thirdUser]);
    localDbSpy.assignSecretSanta.and.resolveTo({
      ok: true,
      notifiedCount: 2,
      emailMode: 'local-outbox',
    });

    component.openManualModal('1');
    component.updateManualPair(0, 'receiverId', '3');

    expect(component.manualValidation().valid).toBeTrue();
    await component.applyManualAssignments();

    expect(localDbSpy.assignSecretSanta).toHaveBeenCalledWith(
      jasmine.arrayContaining([
        jasmine.objectContaining({ id: '1', friend_id: '3' }),
      ]),
      true
    );
    expect(component.showManualModal()).toBeFalse();
  });

  it('blocks saving and exposes error/suggestion banner when manual assignment violates rules', async () => {
    component.openManualModal('1');
    component.updateManualPair(0, 'receiverId', '1');

    expect(component.manualValidation().valid).toBeFalse();
    expect(component.manualValidation().errors.length).toBeGreaterThan(0);
    expect(component.manualValidation().suggestions.length).toBeGreaterThan(0);

    await component.applyManualAssignments();
    expect(localDbSpy.assignSecretSanta).not.toHaveBeenCalled();
  });

  it('syncs manual assignment rows when selecting multiple participants from multi-select', () => {
    component.openManualModal();
    component.onMultiGiversChange(['1', '2']);

    expect(component.manualPairs().length).toBe(2);
    expect(component.selectedManualGiverIds()).toEqual(['1', '2']);

    // Keep existing receiver selection when adding another participant
    component.updateManualPair(0, 'receiverId', '2');
    component.onMultiGiversChange(['1', '2']);
    expect(component.manualPairs()[0].receiverId).toBe('2');
  });
});
