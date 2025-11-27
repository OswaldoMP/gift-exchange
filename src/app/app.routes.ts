import { Routes } from '@angular/router';

import {AuthComponent} from './auth/auth.component';
import {ExchangeComponent} from './exchange/exchange.component';
import { RegisterComponent } from './register/register.component';

export const routes: Routes = [
    {path: "intercambio", component: ExchangeComponent},
    {path: "login", component: AuthComponent},
    {path: "register", component: RegisterComponent}
];
