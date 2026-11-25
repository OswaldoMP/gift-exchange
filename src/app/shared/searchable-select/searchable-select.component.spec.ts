import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  SearchableSelectComponent,
  SelectOption,
} from './searchable-select.component';

describe('SearchableSelectComponent', () => {
  let fixture: ComponentFixture<SearchableSelectComponent>;
  let component: SearchableSelectComponent;

  const sampleOptions: SelectOption[] = [
    { value: '1', label: 'Sofía Morales', sublabel: 'sofia@navidad2026.com' },
    { value: '2', label: 'Carlos Ramírez', sublabel: 'carlos@navidad2026.com' },
    { value: '3', label: 'Valentina Cruz', sublabel: 'valentina@navidad2026.com' },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SearchableSelectComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SearchableSelectComponent);
    component = fixture.componentInstance;
    component.options = sampleOptions;
    fixture.detectChanges();
  });

  it('filters options inside dropdown with accent-insensitive search', () => {
    component.toggleOpen();
    component.searchQuery = 'sofia';
    fixture.detectChanges();

    expect(component.filteredOptions.length).toBe(1);
    expect(component.filteredOptions[0].value).toBe('1');
  });

  it('emits value and closes dropdown in single-select mode', () => {
    const spy = spyOn(component.valueChange, 'emit');
    component.multiple = false;
    component.toggleOpen();
    component.selectOption(sampleOptions[1]);

    expect(spy).toHaveBeenCalledWith('2');
    expect(component.isOpen).toBeFalse();
  });

  it('supports multiple selection with chips and toggling', () => {
    const spy = spyOn(component.valuesChange, 'emit');
    component.multiple = true;
    component.toggleOpen();

    component.selectOption(sampleOptions[0]);
    component.selectOption(sampleOptions[2]);
    expect(component.values).toEqual(['1', '3']);
    expect(spy).toHaveBeenCalledWith(['1', '3']);
    expect(component.isOpen).toBeTrue();

    // Deselecting removes item
    component.selectOption(sampleOptions[0]);
    expect(component.values).toEqual(['3']);
  });
});
