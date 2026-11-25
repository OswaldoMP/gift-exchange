import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  ViewChild,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
  searchText?: string;
}

@Component({
  selector: 'app-searchable-select',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './searchable-select.component.html',
  styleUrls: ['./searchable-select.component.css'],
})
export class SearchableSelectComponent {
  private readonly hostRef = inject(ElementRef<HTMLElement>);

  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;

  @Input() options: SelectOption[] = [];
  @Input() multiple = false;
  @Input() placeholder = 'Selecciona una opción…';
  @Input() searchPlaceholder = 'Buscar…';
  @Input() emptyText = 'Sin coincidencias';
  @Input() disabled = false;

  @Input() value = '';
  @Output() valueChange = new EventEmitter<string>();

  @Input() values: string[] = [];
  @Output() valuesChange = new EventEmitter<string[]>();

  isOpen = false;
  searchQuery = '';

  get filteredOptions(): SelectOption[] {
    const query = this.normalize(this.searchQuery);
    if (!query) {
      return this.options;
    }
    return this.options.filter((opt) => {
      const haystack = this.normalize(
        `${opt.label} ${opt.sublabel || ''} ${opt.searchText || ''}`
      );
      return haystack.includes(query);
    });
  }

  get selectedSingleOption(): SelectOption | undefined {
    return this.options.find((opt) => opt.value === this.value);
  }

  get selectedMultipleOptions(): SelectOption[] {
    const selectedSet = new Set(this.values);
    return this.options.filter((opt) => selectedSet.has(opt.value));
  }

  toggleOpen(): void {
    if (this.disabled) {
      return;
    }
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.searchQuery = '';
      setTimeout(() => this.searchInput?.nativeElement?.focus(), 0);
    }
  }

  close(): void {
    this.isOpen = false;
    this.searchQuery = '';
  }

  isSelected(optionValue: string): boolean {
    if (this.multiple) {
      return this.values.includes(optionValue);
    }
    return this.value === optionValue;
  }

  selectOption(option: SelectOption): void {
    if (this.multiple) {
      const exists = this.values.includes(option.value);
      const next = exists
        ? this.values.filter((v) => v !== option.value)
        : [...this.values, option.value];
      this.values = next;
      this.valuesChange.emit(next);
      return;
    }

    this.value = option.value;
    this.valueChange.emit(option.value);
    this.close();
  }

  removeChip(optionValue: string, event: Event): void {
    event.stopPropagation();
    if (!this.multiple || this.disabled) {
      return;
    }
    const next = this.values.filter((v) => v !== optionValue);
    this.values = next;
    this.valuesChange.emit(next);
  }

  clearSelection(event: Event): void {
    event.stopPropagation();
    if (this.disabled) {
      return;
    }
    if (this.multiple) {
      this.values = [];
      this.valuesChange.emit([]);
    } else {
      this.value = '';
      this.valueChange.emit('');
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.isOpen && !this.hostRef.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  @HostListener('keydown.escape')
  onEscape(): void {
    if (this.isOpen) {
      this.close();
    }
  }

  private normalize(text: string): string {
    return (text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }
}
