import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Ficha } from './ficha';

describe('Ficha', () => {
  let component: Ficha;
  let fixture: ComponentFixture<Ficha>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Ficha],
    }).compileComponents();

    fixture = TestBed.createComponent(Ficha);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
