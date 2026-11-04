import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Anotacoes } from './anotacoes';

describe('Anotacoes', () => {
  let component: Anotacoes;
  let fixture: ComponentFixture<Anotacoes>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Anotacoes],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(Anotacoes);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
