import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, Input, NgZone, OnChanges } from '@angular/core';
import { NgApexchartsModule } from 'ng-apexcharts';
import { TimeEntry, UserNode } from '../../dashboard.model';

interface ChartRow {
  id: number;
  name: string;
  designation: string;
  role: string;
  ownBudget: number;
  ownLogged: number;
  teamBudget: number;
  teamLogged: number;
  utilization: number;
  isAncestor: boolean;   // true = this is a parent in current drilldown path
  originalNode: UserNode;
}

@Component({
  selector: 'app-hierarchy-bar',
  standalone: true,
  imports: [CommonModule, NgApexchartsModule],
  templateUrl: './hierarchy-bar.component.html',
  styleUrls: ['./hierarchy-bar.component.css']
})
export class HierarchyBarComponent implements OnChanges {
  @Input() nodes: UserNode[] = [];
  @Input() workingDays = 0;
  @Input() timeEntries: TimeEntry[] = [];

  chartOptions: any;
  navigationHistory: UserNode[] = [];
  currentRows: ChartRow[] = [];
  focusedRow: ChartRow | null = null;   // the person whose entries show below
  selectedEntries: TimeEntry[] = [];

  constructor(
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) { }

  ngOnChanges(): void {
    if (!this.nodes.length) return;
    if (!this.navigationHistory.length) {
      this.renderRootView();
    } else {
      this.renderLayer(this.navigationHistory[this.navigationHistory.length - 1]);
    }
  }

  // ── Root view: show top-level nodes, each bar = own + team ──────────────
  renderRootView(): void {
    this.navigationHistory = [];
    this.currentRows = this.nodes.map(n => this.buildRow(n, false));
    this.focusedRow = this.currentRows[0] ?? null;
    this.selectedEntries = this.focusedRow
      ? this.ownEntries(this.focusedRow.originalNode)
      : [];
    this.buildChart();
  }

  // ── Drilldown layer: ancestor bar + team bars ────────────────────────────
  renderLayer(manager: UserNode): void {
    const ancestorRow = this.buildRow(manager, true);   // highlighted ancestor
    const teamRows = (manager.directReports ?? []).map(n => this.buildRow(n, false));
    this.currentRows = [ancestorRow, ...teamRows];
    this.focusedRow = ancestorRow;
    this.selectedEntries = this.ownEntries(manager);
    this.buildChart();
  }

  // ── Click on a bar ───────────────────────────────────────────────────────
  handleBarClick(row: ChartRow): void {
    if (row.isAncestor) {
      // clicking the ancestor bar just refocuses its own entries
      this.focusedRow = row;
      this.selectedEntries = this.ownEntries(row.originalNode);
      this.cdr.detectChanges();
      return;
    }

    this.focusedRow = row;
    this.selectedEntries = this.ownEntries(row.originalNode);

    if (row.originalNode.directReports?.length) {
      this.navigationHistory.push(row.originalNode);
      this.renderLayer(row.originalNode);
    }

    this.cdr.detectChanges();
  }

  // ── Back ─────────────────────────────────────────────────────────────────
  navigateBack(): void {
    if (!this.navigationHistory.length) return;
    this.navigationHistory.pop();

    if (!this.navigationHistory.length) {
      this.renderRootView();
    } else {
      this.renderLayer(this.navigationHistory[this.navigationHistory.length - 1]);
    }
  }

  // ── Entry list for focused person ────────────────────────────────────────
  private ownEntries(node: UserNode): TimeEntry[] {
    return this.timeEntries.filter(e =>
      e.userId === node.id ||
      e.userName?.toLowerCase().trim() === node.name.toLowerCase().trim()
    );
  }

  // ── Build a ChartRow ─────────────────────────────────────────────────────
  private buildRow(node: UserNode, isAncestor: boolean): ChartRow {
    const ownBudget = this.r2(this.workingDays * (node.dailyHours ?? 8));
    const ownLogged = this.r2(this.ownEntries(node).reduce((s, e) => s + e.hours, 0));
    const teamBudget = isAncestor ? 0 : this.r2(this.subtreeBudget(node) - ownBudget);
    const teamLogged = isAncestor ? 0 : this.r2(this.subtreeLogged(node) - ownLogged);
    const totalBudget = ownBudget + teamBudget;
    const totalLogged = ownLogged + teamLogged;
    const totalReporteesCount = this.countAllReportees(node);

    const properNameLabel = totalReporteesCount > 0 && !isAncestor
      ? `${node.name} (+${totalReporteesCount})`
      : node.name;

    return {
      id: node.id,
      name: properNameLabel,
      designation: node.designation,
      role: node.role,
      ownBudget,
      ownLogged,
      teamBudget,
      teamLogged,
      utilization: totalBudget ? Math.round((totalLogged / totalBudget) * 100) : 0,
      isAncestor,
      originalNode: node
    };
  }

  private subtreeBudget(node: UserNode): number {
    const own = this.workingDays * (node.dailyHours ?? 8);
    const team = (node.directReports ?? []).reduce((s, c) => s + this.subtreeBudget(c), 0);
    return own + team;
  }

  private subtreeLogged(node: UserNode): number {
    const own = this.ownEntries(node).reduce((s, e) => s + e.hours, 0);
    const team = (node.directReports ?? []).reduce((s, c) => s + this.subtreeLogged(c), 0);
    return own + team;
  }

  private r2(n: number): number {
    return Math.round(n * 100) / 100;
  }

  private countAllReportees(node: UserNode): number {
    if (!node.directReports || node.directReports.length === 0) {
      return 0;
    }

    // Count the direct reports + recursively count each of their reportees
    return node.directReports.reduce((total, child) => {
      return total + 1 + this.countAllReportees(child);
    }, 0);
  }

  // ── Chart config ─────────────────────────────────────────────────────────
  private buildChart(): void {
    const labels = this.currentRows.map(r => r.name);
    const totalLogged = this.currentRows.map(r => this.r2(r.ownLogged + r.teamLogged));
    const totalBudget = this.currentRows.map(r => this.r2(r.ownBudget + r.teamBudget));

    // After totalBudget line, add:
    const maxVal = Math.max(...totalBudget, 1);
    const minBar = maxVal * 0.04;
    const displayLogged = totalLogged.map(v => Math.max(v, minBar));
    const displayBudget = totalBudget.map(v => Math.max(v, minBar));

    const manyRows = this.currentRows.length > 6;
    const chartHeight = manyRows ? 420 : 320;

    const loggedColors = this.currentRows.map(r => r.isAncestor ? '#f59e0b' : '#2563eb');
    const budgetColors = this.currentRows.map(r => r.isAncestor ? '#fde68a' : '#cbd5e1');

    this.chartOptions = {
      series: [
        {
          name: 'Logged',
          data: displayLogged.map((val, i) => ({ x: labels[i], y: val, fillColor: loggedColors[i] }))
        },
        {
          name: 'Budget',
          data: displayBudget.map((val, i) => ({ x: labels[i], y: val, fillColor: budgetColors[i] }))
        }
      ],
      chart: {
        type: 'bar',
        height: chartHeight,
        stacked: false,
        fontFamily: 'Inter, Segoe UI, sans-serif',
        toolbar: { show: false },
        events: {
          dataPointSelection: (_e: unknown, _ctx: unknown, cfg: { dataPointIndex: number }) => {
            const row = this.currentRows[cfg.dataPointIndex];
            if (row) this.ngZone.run(() => this.handleBarClick(row));
          }
        }
      },
      colors: ['#2563eb', '#cbd5e1'],
      plotOptions: {
        bar: {
          horizontal: false,
          columnWidth: manyRows ? '70%' : '52%',
          borderRadius: 4,
          borderRadiusApplication: 'end',
          distributed: false,
          dataLabels: { position: 'top' }
        }
      },
      dataLabels: {
        enabled: true,
        formatter: (_val: number, opts: any) => {
          const real = opts.seriesIndex === 0
            ? totalLogged[opts.dataPointIndex]
            : totalBudget[opts.dataPointIndex];
          return `${this.r2(real)}h`;
        },
        style: { fontSize: '11px', fontWeight: 600, colors: ['#64748b', '#64748b'] },
        background: { enabled: false },
        offsetY: -20,
        offsetX: 0,
      },
      stroke: { width: 2, colors: ['#ffffff'] },
      xaxis: {
        categories: labels,
        labels: {
          rotate: -45,
          rotateAlways: true,
          trim: false,
          style: { colors: '#475569', fontSize: '11px', fontWeight: 600 }
        }
      },
      yaxis: { labels: { formatter: (v: number) => `${v}h` } },
      legend: {
        position: 'top',
        horizontalAlign: 'right',
        fontSize: '12px',
        fontWeight: 700,
        markers: { radius: 4 }
      },
      grid: { borderColor: '#e2e8f0' },
      tooltip: {
        custom: ({ dataPointIndex }: { dataPointIndex: number }) => {
          const r = this.currentRows[dataPointIndex];
          const tl = this.r2(r.ownLogged + r.teamLogged);
          const tb = this.r2(r.ownBudget + r.teamBudget);
          return `
        <div class="chart-tooltip">
          <strong>${r.name}</strong>
          <span>${r.designation}</span>
          <p>Logged: ${tl}h &nbsp;|&nbsp; Budget: ${tb}h</p>
          <p>Utilization: <b>${r.utilization}%</b></p>
          ${r.teamBudget > 0 ? `<p style="color:#94a3b8;font-size:11px">Own: ${this.r2(r.ownLogged)}h &nbsp;+&nbsp; Team: ${this.r2(r.teamLogged)}h</p>` : ''}
        </div>`;
        }
      },
      annotations: {
        xaxis: this.currentRows.map(r => ({
          x: r.name,
          label: {
            text: `${r.utilization}%`,
            position: 'top',
            orientation: 'horizontal',
            style: {
              fontSize: '11px',
              fontWeight: 800,
              color: r.utilization >= 90 ? '#16a34a' : r.utilization >= 70 ? '#d97706' : '#dc2626',
              background: 'transparent',
              border: 'none',
              padding: { top: 0, bottom: 4, left: 4, right: 4 }
            }
          }
        }))
      }
    };
  }
}
