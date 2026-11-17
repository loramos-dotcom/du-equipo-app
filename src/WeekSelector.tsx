import {CalendarDays,ChevronLeft,ChevronRight} from 'lucide-react';
import {addDays,rangeLabel} from '../shared/model';

export default function WeekSelector({week,currentWeek,onChange}:{week:string;currentWeek:string;onChange:(week:string)=>void}){
 return <><div className="week-selector" role="group" aria-label="Seleccionar semana"><button className="icon" aria-label="Semana anterior" onClick={()=>onChange(addDays(week,-7))}><ChevronLeft size={19}/></button><CalendarDays size={17}/><strong>{rangeLabel(week)}</strong><button className="icon" aria-label="Semana siguiente" onClick={()=>onChange(addDays(week,7))}><ChevronRight size={19}/></button></div><button className="text-button" onClick={()=>onChange(currentWeek)}>Esta semana</button></>;
}
