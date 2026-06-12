import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProjectEfficiencyComponent } from './project-efficiency.component';

describe('ProjectEfficiencyComponent', () => {
  let component: ProjectEfficiencyComponent;
  let fixture: ComponentFixture<ProjectEfficiencyComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProjectEfficiencyComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ProjectEfficiencyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
