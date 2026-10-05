"""Contabiliza la mora diaria y sincroniza el semáforo de los préstamos.

Uso (cron diario, 00:05 hora de Managua):

    python manage.py actualizar_mora

Opciones:

    --fecha YYYY-MM-DD   Fecha de corte (default: hoy).
    --prestamo <id>      Limita el cálculo a un préstamo.
    --dry-run            Muestra qué cambiaría sin escribir.
"""
from datetime import datetime
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from API.models import Prestamo
from API.services.mora import actualizar_mora_prestamo, detalle_mora, estado_por_mora


class Command(BaseCommand):
    help = 'Genera la mora por atraso de los préstamos y actualiza su estado (EN_GRACIA / EN_MORA).'

    def add_arguments(self, parser):
        parser.add_argument('--fecha', type=str, default=None,
                            help='Fecha de corte YYYY-MM-DD (default: hoy)')
        parser.add_argument('--prestamo', type=int, default=None,
                            help='Calcular solo el préstamo indicado')
        parser.add_argument('--dry-run', action='store_true',
                            help='Reportar sin persistir cambios')

    def _fecha(self, valor):
        if not valor:
            return timezone.localdate()
        try:
            return datetime.strptime(valor, '%Y-%m-%d').date()
        except ValueError:
            raise CommandError(f'Fecha inválida: {valor}. Use el formato YYYY-MM-DD.')

    def handle(self, *args, **options):
        fecha = self._fecha(options['fecha'])
        dry_run = options['dry_run']

        qs = Prestamo.objects.exclude(estado=Prestamo.Estado.CANCELADO)
        if options['prestamo']:
            qs = qs.filter(pk=options['prestamo'])
            if not qs.exists():
                raise CommandError(f'Préstamo {options["prestamo"]} no encontrado o cancelado.')

        en_gracia = en_mora = sin_cambio = 0
        mora_total = Decimal('0.00')

        for prestamo in qs.select_related('cliente').order_by('pk'):
            detalle = (
                detalle_mora(prestamo, hoy=fecha)
                if dry_run
                else actualizar_mora_prestamo(prestamo, hoy=fecha)
            )
            mora_total += detalle['mora_no_persistida']

            if dry_run:
                # Sin persistir no hay estado recalculado: se proyecta el que
                # tendría tras el corte para que el reporte no diga "al día" a
                # un préstamo que ya superó la gracia.
                estado = estado_por_mora(prestamo, hoy=fecha)
                detalle['cambio_estado'] = estado != prestamo.estado
            else:
                estado = detalle.get('estado') or prestamo.estado

            if estado == Prestamo.Estado.EN_MORA:
                en_mora += 1
            elif estado == Prestamo.Estado.EN_GRACIA:
                en_gracia += 1
            else:
                sin_cambio += 1

            if detalle['dias_nuevos'] or detalle.get('cambio_estado'):
                arrow = '->' if detalle.get('cambio_estado') else '=>'
                self.stdout.write(
                    f'#{prestamo.id} {prestamo.cliente}: '
                    f'{detalle["dias_mora"]} días de mora '
                    f'(+{detalle["mora_no_persistida"]}) '
                    f'{arrow} {estado}'
                )

        prefijo = '[dry-run] ' if dry_run else ''
        self.stdout.write(self.style.SUCCESS(
            f'{prefijo}Corte {fecha}: {en_mora} en mora, {en_gracia} en gracia, '
            f'{sin_cambio} al día. Mora generada C${mora_total:,.2f}.'
        ))
