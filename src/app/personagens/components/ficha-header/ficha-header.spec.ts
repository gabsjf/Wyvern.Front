import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FichaHeader } from './ficha-header';

describe('FichaHeader', () => {
  let component: FichaHeader;
  let fixture: ComponentFixture<FichaHeader>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FichaHeader],
    }).compileComponents();

    fixture = TestBed.createComponent(FichaHeader);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
