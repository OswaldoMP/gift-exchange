import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { RegisterComponent } from './register.component';
import { LocalDbService } from '../services/local-db.service';
import { AlertService } from '../services/alert-service.service';
import { DEFAULT_EXCHANGE_CONFIG } from '../models/exchanges.entity';

describe('RegisterComponent', () => {
  let fixture: ComponentFixture<RegisterComponent>;
  let component: RegisterComponent;
  let localDbSpy: jasmine.SpyObj<LocalDbService>;
  let routerSpy: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    localStorage.clear();

    localDbSpy = jasmine.createSpyObj<LocalDbService>('LocalDbService', [
      'signUp',
      'resendConfirmation',
      'getInfoEvent',
      'getCachedInfoEvent',
    ]);
    localDbSpy.getInfoEvent.and.resolveTo(DEFAULT_EXCHANGE_CONFIG);
    localDbSpy.getCachedInfoEvent.and.returnValue(DEFAULT_EXCHANGE_CONFIG);

    routerSpy = jasmine.createSpyObj<Router>('Router', ['navigate']);
    routerSpy.navigate.and.resolveTo(true);

    await TestBed.configureTestingModule({
      imports: [RegisterComponent],
      providers: [
        AlertService,
        { provide: LocalDbService, useValue: localDbSpy },
        { provide: Router, useValue: routerSpy },
        { provide: ActivatedRoute, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RegisterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('registers as participant and navigates directly to /intercambio', async () => {
    localDbSpy.signUp.and.resolveTo({
      data: {
        user: {
          id: 'u-100',
          email: 'ana@navidad2026.com',
          role: 'authenticated',
          user_metadata: { username: 'Ana López' },
        },
        session: {
          access_token: 'tok-ana',
          expires_at: '2026-12-31T00:00:00.000Z',
          user: {
            id: 'u-100',
            email: 'ana@navidad2026.com',
            role: 'authenticated',
            user_metadata: { username: 'Ana López' },
          },
        },
      },
      error: null,
    });

    component.fullName.set('Ana López');
    component.email.set('ana@navidad2026.com');
    component.password.set('Clave2026!');

    await component.onRegister();

    expect(localStorage.getItem('uuid')).toBe('u-100');
    expect(localStorage.getItem('username')).toBe('Ana López');
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/intercambio']);
  });

  it('shows pending email confirmation notice when requiresConfirmation is true', async () => {
    localDbSpy.signUp.and.resolveTo({
      data: {
        user: {
          id: 'u-101',
          email: 'carlos@navidad2026.com',
          role: 'authenticated',
          user_metadata: { username: 'Carlos' },
        },
        session: null,
        requiresConfirmation: true,
        emailSent: true,
        confirmationPreviewUrl: 'http://localhost:4200/login?confirmToken=abc',
      },
      error: null,
    });

    component.fullName.set('Carlos');
    component.email.set('carlos@navidad2026.com');
    component.password.set('Clave2026!');

    await component.onRegister();

    expect(component.pendingConfirmation()).toBeTrue();
    expect(component.confirmationPreviewUrl()).toContain('confirmToken=abc');
    expect(routerSpy.navigate).not.toHaveBeenCalled();
  });
});
