import { Injectable } from '@angular/core';
import { TimeEntry, UserNode } from '../../dashboard/dashboard.model';
import { AppUserSession } from './auth.service';

@Injectable({ providedIn: 'root' })
export class HierarchyAccessService {

  // Returns the subtree the logged-in user is allowed to see
  getVisibleHierarchy(
    fullHierarchy: UserNode[],
    session: AppUserSession,
    timeEntries: TimeEntry[]
  ): UserNode[] {
    if (session.role === 'SuperAdmin') {
      return fullHierarchy;  // sees everything
    }

    // find the node that matches the logged-in user by name
    const myNode = this.findNodeByName(fullHierarchy, session.redmineName, timeEntries);
    if (!myNode) return [];

    // return their subtree as the root
    return [myNode];
  }

  // Find the deepest node whose name matches the logged-in user
  // Also cross-check via time entries if name is ambiguous
  private findNodeByName(
    nodes: UserNode[],
    name: string,
    timeEntries: TimeEntry[]
  ): UserNode | null {
    for (const node of nodes) {
      if (this.nameMatches(node.name, name)) {
        return node;
      }
      if (node.directReports?.length) {
        const found = this.findNodeByName(node.directReports, name, timeEntries);
        if (found) return found;
      }
    }
    return null;
  }

  // Filter time entries to only those belonging to visible users
  getVisibleTimeEntries(
    allEntries: TimeEntry[],
    visibleHierarchy: UserNode[]
  ): TimeEntry[] {
    const visibleNames = new Set<string>();
    this.collectNames(visibleHierarchy, visibleNames);

    return allEntries.filter(entry =>
      entry.userName && visibleNames.has(this.normalizeName(entry.userName))
    );
  }

  // Collect all names in a subtree
  private collectNames(nodes: UserNode[], set: Set<string>): void {
    for (const node of nodes) {
      set.add(this.normalizeName(node.name));
      if (node.directReports?.length) {
        this.collectNames(node.directReports, set);
      }
    }
  }

  private nameMatches(a: string, b: string): boolean {
    return this.normalizeName(a) === this.normalizeName(b);
  }

  private normalizeName(name: string): string {
    return name.toLowerCase().trim().replace(/\s+/g, ' ');
  }
}
