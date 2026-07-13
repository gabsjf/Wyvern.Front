import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FichaAtributos } from './ficha-atributos';

describe('FichaAtributos', () => {
  let component: FichaAtributos;
  let fixture: ComponentFixture<FichaAtributos>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FichaAtributos],
    }).compileComponents();

    fixture = TestBed.createComponent(FichaAtributos);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
