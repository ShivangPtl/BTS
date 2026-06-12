import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RedmineProject } from '../../dashboard/dashboard.model';

export type AppView = 'hierarchy' | 'projects' | 'sprints' | 'admin';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.css']
})
export class NavbarComponent {
  @Input() selectedView: AppView = 'hierarchy';
  @Input() loggedInUser = '';
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

  navItems: { key: AppView; label: string }[] = [
    { key: 'hierarchy', label: 'Hierarchy'     },
    { key: 'projects',  label: 'Projects'      },
    { key: 'sprints',   label: 'Sprint Health' },
    { key: 'admin',     label: 'Admin Masters' },
  ];

  get activeProjectLabel(): string {
    return this.projects.find(p => p.id === Number(this.selectedProjectId))?.name ?? 'Project';
  }

  select(view: AppView): void {
    this.selectedViewChange.emit(view);
  }
}
