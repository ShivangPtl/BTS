import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SprintSummaryComponent } from './sprint-summary.component';

describe('SprintSummaryComponent', () => {
  let component: SprintSummaryComponent;
  let fixture: ComponentFixture<SprintSummaryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SprintSummaryComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SprintSummaryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
