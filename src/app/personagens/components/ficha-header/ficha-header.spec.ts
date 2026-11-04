import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FichaHeader } from './ficha-header';

describe('FichaHeader', () => {
  let component: FichaHeader;
  let fixture: ComponentFixture<FichaHeader>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FichaHeader],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(FichaHeader);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
