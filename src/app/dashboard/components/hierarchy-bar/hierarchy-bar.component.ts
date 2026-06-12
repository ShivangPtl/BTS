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
  ) {}

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
    const ownBudget   = this.workingDays * (node.dailyHours ?? 8);
    const ownLogged   = this.ownEntries(node).reduce((s, e) => s + e.hours, 0);
    const teamBudget  = this.subtreeBudget(node) - ownBudget;
    const teamLogged  = this.subtreeLogged(node) - ownLogged;
    const totalBudget = ownBudget + teamBudget;
    const totalLogged = ownLogged + teamLogged;

    return {
      id: node.id,
      name: node.name,
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

  // ── Chart config ─────────────────────────────────────────────────────────
  private buildChart(): void {
    const labels     = this.currentRows.map(r => r.name);
    const ownLogged  = this.currentRows.map(r => r.ownLogged);
    const teamLogged = this.currentRows.map(r => r.teamLogged);
    const ownBudget  = this.currentRows.map(r => r.ownBudget);
    const teamBudget = this.currentRows.map(r => r.teamBudget);

    // ancestor bar gets a distinct amber color
    const loggedColors = this.currentRows.map(r =>
      r.isAncestor ? '#f59e0b' : '#2563eb'
    );
    const budgetColors = this.currentRows.map(r =>
      r.isAncestor ? '#fde68a' : '#cbd5e1'
    );

    this.chartOptions = {
      series: [
        { name: 'Own Logged',   data: ownLogged  },
        { name: 'Team Logged',  data: teamLogged },
        { name: 'Own Budget',   data: ownBudget  },
        { name: 'Team Budget',  data: teamBudget },
      ],
      chart: {
        type: 'bar',
        height: 320,
        stacked: true,
        fontFamily: 'Inter, Segoe UI, sans-serif',
        toolbar: { show: false },
        events: {
          dataPointSelection: (_e: unknown, _ctx: unknown, cfg: { dataPointIndex: number }) => {
            const row = this.currentRows[cfg.dataPointIndex];
            if (row) this.ngZone.run(() => this.handleBarClick(row));
          }
        }
      },
      // 4 series → 4 color arrays, ApexCharts picks per-bar from distributed
      colors: [
        ({ dataPointIndex }: any) => loggedColors[dataPointIndex],
        ({ dataPointIndex }: any) => loggedColors[dataPointIndex] + '99',   // team logged = semi-transparent
        ({ dataPointIndex }: any) => budgetColors[dataPointIndex],
        ({ dataPointIndex }: any) => budgetColors[dataPointIndex],
      ],
      plotOptions: {
        bar: {
          horizontal: false,
          columnWidth: '52%',
          borderRadius: 0,
          borderRadiusApplication: 'end',
          borderRadiusWhenStacked: 'last',
          distributed: false,
        }
      },
      dataLabels: {
        enabled: true,
        enabledOnSeries: [0, 1],   // only show labels on logged series
        formatter: (val: number) => val > 0 ? `${val}h` : '',
        style: { fontSize: '10px', fontWeight: 800, colors: ['#fff'] }
      },
      stroke: { width: 1, colors: ['#ffffff'] },
      xaxis: {
        categories: labels,
        labels: { style: { colors: '#475569', fontSize: '12px', fontWeight: 700 } }
      },
      yaxis: {
        labels: { formatter: (v: number) => `${v}h` }
      },
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
          const totalLogged = r.ownLogged + r.teamLogged;
          const totalBudget = r.ownBudget + r.teamBudget;
          return `
            <div class="chart-tooltip">
              <strong>${r.name}</strong>
              <span>${r.designation}</span>
              <p>Own: ${r.ownLogged}h logged / ${r.ownBudget}h budget</p>
              ${r.teamBudget > 0 ? `<p>Team: ${r.teamLogged}h logged / ${r.teamBudget}h budget</p>` : ''}
              <p>Total: ${totalLogged}h / ${totalBudget}h &nbsp;<b>${r.utilization}%</b></p>
            </div>`;
        }
      },
      annotations: {
        xaxis: this.currentRows.map((r, i) => ({
          x: r.name,
          label: {
            text: `${r.utilization}%`,
            position: 'top',
            orientation: 'horizontal',
            style: {
              fontSize: '10px',
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
