import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { ExchangeComponent } from './exchange.component';
import { LocalDbService } from '../services/local-db.service';
import { Participant } from '../models/participant-entity';
import { DEFAULT_EXCHANGE_CONFIG } from '../models/exchanges.entity';

describe('ExchangeComponent (#assignedView states)', () => {
  let fixture: ComponentFixture<ExchangeComponent>;
  let component: ExchangeComponent;

  const assignedParticipant: Participant = {
    id: '2',
    name: 'Sofía Morales',
    avatarUrl: '',
    is_ready: true,
    gifts: [
      { id: '10', title: 'Audífonos', store: 'Amazon', link: 'https://example.com' },
    ],
  };

  const currentParticipant: Participant = {
    id: '1',
    name: 'Carlos',
    avatarUrl: '',
    is_ready: true,
    friend_id: '2',
    gifts: [],
  };

  beforeEach(async () => {
    localStorage.clear();

    const localDbSpy = jasmine.createSpyObj<LocalDbService>('LocalDbService', [
      'getParticipant',
      'getParticipants',
      'getInfoEvent',
      'getCachedInfoEvent',
      'updateParticipantWheelStatus',
    ]);
    localDbSpy.getParticipant.and.resolveTo(currentParticipant);
    localDbSpy.getParticipants.and.resolveTo([assignedParticipant]);
    localDbSpy.getInfoEvent.and.resolveTo(DEFAULT_EXCHANGE_CONFIG);
    localDbSpy.getCachedInfoEvent.and.returnValue(DEFAULT_EXCHANGE_CONFIG);
    localDbSpy.updateParticipantWheelStatus.and.resolveTo({
      ...currentParticipant,
      wheel_played: true,
    });

    const routerSpy = jasmine.createSpyObj<Router>('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [ExchangeComponent],
      providers: [
        { provide: LocalDbService, useValue: localDbSpy },
        { provide: Router, useValue: routerSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: { get: () => null },
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ExchangeComponent);
    component = fixture.componentInstance;
    component.currentUser = { ...currentParticipant };
    component.participants = [assignedParticipant];
    component.drawResult = true;
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('shows waiting template when draw has not assigned a friend yet', () => {
    component.assignedFriend = undefined;
    component.wheelAlreadyPlayed = false;
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.participation .empty-state')?.textContent).toContain(
      'Espera la confirmación del sorteo.'
    );
    expect(el.querySelector('.wheel-btn')).toBeNull();
    expect(el.querySelector('.assigned-card')).toBeNull();
  });

  it('hides waiting template and shows only wheel button once draw is generated and wheel not played', () => {
    component.assignedFriend = '2';
    component.wheelAlreadyPlayed = false;
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.participation .empty-state')).toBeNull();
    expect(el.querySelector('.wheel-btn')?.textContent).toContain(
      'Gira la ruleta y conoce a tu amigo secreto!'
    );
    expect(el.querySelector('.assigned-card')).toBeNull();
    expect(el.querySelector('.gift-grid.alt')).toBeNull();
  });

  it('hides waiting template and wheel button and shows assigned friend after wheel is played', () => {
    component.assignedFriend = '2';
    component.wheelAlreadyPlayed = true;
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.participation .empty-state')).toBeNull();
    expect(el.querySelector('.wheel-btn')).toBeNull();
    expect(el.querySelector('.assigned-card h3')?.textContent).toContain('Sofía Morales');
    expect(el.querySelectorAll('.gift-grid.alt li').length).toBe(1);
  });

  it('builds readable SVG wheel slices for up to 50 participants', () => {
    component.participants = Array.from({ length: 50 }).map((_, idx) => ({
      id: String(idx + 1),
      name: `Participante Nombre ${idx + 1}`,
      gifts: [],
      is_ready: true,
    }));

    const slices = component.wheelSlices;
    expect(slices.length).toBe(50);
    expect(slices[0].fontSize).toBeLessThan(8);
    expect(slices[0].color).not.toBe(slices[49].color);
  });
});
