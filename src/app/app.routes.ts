import { Routes } from '@angular/router';

import {AuthComponent} from './auth/auth.component';
import {ExchangeComponent} from './exchange/exchange.component';
import { RegisterComponent } from './register/register.component';
import { AdminComponent } from './admin/admin.component';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';

export const routes: Routes = [
    {path: "intercambio", component: ExchangeComponent, canActivate: [authGuard]},
    {path: "login", component: AuthComponent},
    {path: "register", component: RegisterComponent},
    {path: "admin", component: AdminComponent, canActivate: [authGuard, adminGuard]},
    {path: "", pathMatch: "full", redirectTo: "login"},
    {path: "**", redirectTo: "login"}
];
