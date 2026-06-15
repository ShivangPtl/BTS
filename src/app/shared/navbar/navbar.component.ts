import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AppUserSession, AuthService } from '../../core/services/auth.service';
import { RedmineProject } from '../../dashboard/dashboard.model';

export type AppView = 'overview' | 'utilization' | 'sprints' | 'issues' | 'admin';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.css']
})
export class NavbarComponent {
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


  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  navItems: { key: AppView; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'utilization', label: 'Utilization' },
    { key: 'sprints', label: 'Sprints' },
    { key: 'issues', label: 'Issues' },
    { key: 'admin', label: 'Admin' },
  ];

  get activeProjectLabel(): string {
    return this.projects.find(p => p.id === Number(this.selectedProjectId))?.name ?? 'Project';
  }

  select(view: AppView): void {
    this.selectedViewChange.emit(view);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

}
