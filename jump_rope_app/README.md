# JumpRope App

App Flutter de pulo de corda com detecção por câmera, corda virtual verde e treinos parametrizados por séries.

## Funcionalidades

- Câmera frontal com detecção de pose (Google ML Kit)
- Contagem de pulos por movimento corporal
- Corda virtual verde ancorada nas mãos com efeito de impacto no chão
- Som da corda batendo no chão (ligar/desligar)
- Treinos por séries: pulos + descanso parametrizável
- Contador da série e contador total acumulado
- Avisos sonoros e vibração em descanso, retorno e fim de treino
- Presets e treino personalizado

## Executar

```bash
cd jump_rope_app
flutter pub get
flutter run
```

Requer dispositivo físico iOS ou Android (câmera necessária).

## Estrutura

- `lib/domain` — entidades e lógica pura (contador, config)
- `lib/workout` — motor de séries e descanso
- `lib/data` — câmera, ML Kit, áudio
- `lib/presentation` — telas, widgets, BLoC

## Exemplo de treino

10 séries × 200 pulos com 40 segundos de descanso entre séries.
