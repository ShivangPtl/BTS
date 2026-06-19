import { CommonModule, TitleCasePipe } from '@angular/common';
import { Component, EventEmitter, HostListener, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AppUserSession, AuthService } from '../../core/services/auth.service';
import { PublicHoliday, RedmineProject } from '../../dashboard/dashboard.model';
import { ClickOutsideDirective } from '../click-outside.directive';

export type AppView = 'overview' | 'utilization' | 'sprints' | 'issues' | 'admin';
export type DatePreset = 'this-week' | 'last-week' | 'this-month' | 'last-month' | 'this-year' | 'custom';

interface CalCell { date: string | null; label: string; }

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, FormsModule, TitleCasePipe, ClickOutsideDirective],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.css']
})
export class NavbarComponent implements OnInit {
  @Input() selectedView: AppView = 'overview';
  @Input() session: AppUserSession | null = null;
  @Input() projects: RedmineProject[] = [];
  @Input() apiStatus: 'Mock data' | 'Connected' = 'Mock data';

  @Input() selectedProjectId = 'all';
  @Output() selectedProjectIdChange = new EventEmitter<string>();

  @Input() startDate = '';
  @Output() startDateChange = new EventEmitter<string>();

  @Input() endDate = '';
  @Output() endDateChange = new EventEmitter<string>();

  @Output() selectedViewChange = new EventEmitter<AppView>();
  @Output() filterChange = new EventEmitter<void>();
  @Input() holidays: PublicHoliday[] = [];

  // ── Presets ──
  activePreset: DatePreset = 'this-month';
  presets: { key: DatePreset; label: string }[] = [
    { key: 'this-week',  label: 'This Week' },
    { key: 'last-week',  label: 'Last Week' },
    { key: 'this-month', label: 'This Month' },
    { key: 'last-month', label: 'Last Month' },
    { key: 'this-year',  label: 'This Year' },
    { key: 'custom',     label: 'Custom' },
  ];

  // ── Calendar picker state ──
  pickerOpen   = false;
  viewYear     = new Date().getFullYear();
  viewMonth    = new Date().getMonth();

  pendingStart: string | null = null;
  pendingEnd:   string | null = null;
  hoverDate:    string | null = null;
  selectingEnd  = false;

  readonly dow = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

  constructor(private authService: AuthService, private router: Router) {}

  navItems: { key: AppView; label: string }[] = [
    { key: 'overview',    label: 'Overview' },
    { key: 'utilization', label: 'Utilization' },
    // { key: 'sprints',     label: 'Sprints' },
    // { key: 'issues',      label: 'Issues' },
    // { key: 'admin',       label: 'Admin' },
  ];

  ngOnInit(): void {
    const { start, end } = this.getPresetRange('this-month');
    this.startDateChange.emit(start);
    this.endDateChange.emit(end);
    this.selectedProjectIdChange.emit('all');
    const d = new Date(start);
    this.viewYear  = d.getFullYear();
    this.viewMonth = d.getMonth();
  }

  // ── Preset handling ──
  applyPreset(key: DatePreset): void {
    this.activePreset = key;
    if (key === 'custom') {
      // Stay open, reset pending so user can pick fresh
      this.pendingStart = null;
      this.pendingEnd   = null;
      this.hoverDate    = null;
      this.selectingEnd = false;
      return;
    }
    const { start, end } = this.getPresetRange(key);
    this.startDateChange.emit(start);
    this.endDateChange.emit(end);
    this.filterChange.emit();
    this.pickerOpen = false;
  }

  // ── Picker open/close ──
  togglePicker(): void {
    if (this.pickerOpen) {
      this.closePicker();
    } else {
      this.openPicker();
    }
  }

  openPicker(): void {
    this.pickerOpen   = true;
    this.pendingStart = null;
    this.pendingEnd   = null;
    this.hoverDate    = null;
    this.selectingEnd = false;
    if (this.startDate) {
      const d = new Date(this.startDate);
      this.viewYear  = d.getFullYear();
      this.viewMonth = d.getMonth();
    }
  }

  // Called by clickOutside directive — only close if picker is open
  closepicker(): void { this.closePicker(); }
  closePicker(): void { this.pickerOpen = false; }

  @HostListener('document:keydown.escape')
  onEsc(): void { this.pickerOpen = false; }

  // ── Calendar navigation ──
  shiftMonth(delta: number): void {
    this.viewMonth += delta;
    if (this.viewMonth > 11) { this.viewMonth = 0;  this.viewYear++; }
    if (this.viewMonth < 0)  { this.viewMonth = 11; this.viewYear--; }
  }

  get leftMonthLabel():  string { return this.monthLabel(this.viewYear, this.viewMonth); }
  get rightMonthLabel(): string {
    const m = (this.viewMonth + 1) % 12;
    const y = this.viewMonth === 11 ? this.viewYear + 1 : this.viewYear;
    return this.monthLabel(y, m);
  }

  get leftCells():  CalCell[] { return this.buildCells(this.viewYear, this.viewMonth); }
  get rightCells(): CalCell[] {
    const m = (this.viewMonth + 1) % 12;
    const y = this.viewMonth === 11 ? this.viewYear + 1 : this.viewYear;
    return this.buildCells(y, m);
  }

  // ── Day selection — simple two-click: first=start, second=end ──
  selectDay(date: string): void {
    if (!this.selectingEnd) {
      // First click: set start, switch to custom immediately
      this.pendingStart = date;
      this.pendingEnd   = null;
      this.hoverDate    = null;
      this.selectingEnd = true;
      this.activePreset = 'custom';
    } else {
      // Second click: set end (swap if needed)
      if (date < this.pendingStart!) {
        this.pendingEnd   = this.pendingStart;
        this.pendingStart = date;
      } else {
        this.pendingEnd = date;
      }
      this.selectingEnd = false;
    }
  }

  hoverDay(date: string): void {
    if (this.selectingEnd) this.hoverDate = date;
  }

  applyCustomRange(): void {
    if (!this.pendingStart || !this.pendingEnd) return;
    const [s, e] = this.pendingStart <= this.pendingEnd
      ? [this.pendingStart, this.pendingEnd]
      : [this.pendingEnd, this.pendingStart];
    this.activePreset = 'custom';
    this.startDateChange.emit(s);
    this.endDateChange.emit(e);
    this.filterChange.emit();
    this.pickerOpen = false;
  }

  // ── Cell state helpers ──
  isStart(date: string): boolean {
    if (this.pendingStart) return date === this.pendingStart;
    return date === this.startDate;
  }

  isEnd(date: string): boolean {
    if (this.selectingEnd) return false;           // still picking end — no end highlight yet
    if (this.pendingEnd)   return date === this.pendingEnd;
    return date === this.endDate;
  }

  isToday(date: string): boolean { return date === this.fmt(new Date()); }

  isInRange(date: string): boolean {
    const s = this.pendingStart ?? this.startDate;
    const e = this.selectingEnd
      ? (this.hoverDate ?? null)
      : (this.pendingEnd ?? this.endDate);
    if (!s || !e) return false;
    const [lo, hi] = s <= e ? [s, e] : [e, s];
    return date > lo && date < hi;
  }

  get selectionHint(): string {
    if (!this.pendingStart) return 'Click a start date';
    if (this.selectingEnd)  return 'Now click an end date';
    if (this.pendingEnd)    return `${this.pendingStart}  →  ${this.pendingEnd}`;
    return '';
  }

  // ── Calendar cell builder ──
  private buildCells(year: number, month: number): CalCell[] {
    const first    = new Date(year, month, 1);
    const lastDay  = new Date(year, month + 1, 0).getDate();
    const startDow = (first.getDay() + 6) % 7; // Monday-first
    const cells: CalCell[] = [];
    for (let i = 0; i < startDow; i++) cells.push({ date: null, label: '' });
    for (let d = 1; d <= lastDay; d++) {
      const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ date, label: String(d) });
    }
    return cells;
  }

  private monthLabel(year: number, month: number): string {
    return new Date(year, month, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  }

  private fmt(d: Date): string { return d.toISOString().slice(0, 10); }

  // ── Preset range calc ──
  private getPresetRange(key: DatePreset): { start: string; end: string } {
    const today = new Date();
    const fmt   = (d: Date) => d.toISOString().slice(0, 10);

    switch (key) {
      case 'this-week': {
        // Monday of current week → today
        const day = today.getDay();
        const mon = new Date(today);
        mon.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
        return { start: fmt(mon), end: fmt(today) };
      }
      case 'last-week': {
        const day = today.getDay();
        const mon = new Date(today);
        mon.setDate(today.getDate() - (day === 0 ? 6 : day - 1) - 7);
        const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
        return { start: fmt(mon), end: fmt(sun) };
      }
      case 'this-month': {
        const s = new Date(today.getFullYear(), today.getMonth(), 1);
        const e = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        return { start: fmt(s), end: fmt(e) };
      }
      case 'last-month': {
        const s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const e = new Date(today.getFullYear(), today.getMonth(), 0);
        return { start: fmt(s), end: fmt(e) };
      }
      case 'this-year': {
        return {
          start: fmt(new Date(today.getFullYear(), 0, 1)),
          end:   fmt(new Date(today.getFullYear(), 11, 31))
        };
      }
      default:
        return { start: fmt(today), end: fmt(today) };
    }
  }

  get activeProjectLabel(): string {
    return this.projects.find(p => p.id === Number(this.selectedProjectId))?.name ?? 'Project';
  }

  select(view: AppView): void { this.selectedViewChange.emit(view); }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  getHoliday(date: string): PublicHoliday | undefined {
    return this.holidays.find(h => h.date.slice(0, 10) === date);
  }
}
